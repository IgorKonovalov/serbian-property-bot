import { Telegraf } from 'telegraf'
import { initDatabase } from '../../db/database'
import { findOrCreateUser } from '../../db/queries/users'
import {
  getUserProfiles,
  seedDefaultProfiles,
} from '../../db/queries/search-profiles'
import { registerSearchCommand, startSearchWithProfiles } from './search'
import type { ParserRegistry } from '../../parsers/registry'
import type { Listing } from '../../parsers/types'

function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    externalId: 'ext-1',
    source: 'test',
    url: 'https://example.com/1',
    title: 'Nice apartment',
    price: 100000,
    size: 65,
    plotSize: null,
    rooms: 3,
    area: 'Centar',
    city: 'Beograd',
    imageUrl: null,
    ...overrides,
  }
}

function makeMockRegistry(results: Listing[] = []): ParserRegistry {
  return {
    searchAll: jest.fn().mockResolvedValue(results),
    searchCombined: jest.fn().mockResolvedValue(results),
  } as unknown as ParserRegistry
}

function makeBot(registry: ParserRegistry): Telegraf {
  const bot = new Telegraf('fake-token')
  registerSearchCommand(bot, registry)
  bot.telegram.callApi = jest.fn().mockResolvedValue({
    message_id: 1,
    date: Date.now(),
    chat: { id: 123, type: 'private' },
  })
  return bot
}

function makeCommandUpdate(text: string) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      from: {
        id: 123,
        is_bot: false,
        first_name: 'Test',
        username: 'testuser',
      },
      chat: { id: 123, type: 'private' as const },
      date: Math.floor(Date.now() / 1000),
      text,
      entities: [
        { type: 'bot_command' as const, offset: 0, length: text.length },
      ],
    },
  }
}

function makeTextUpdate(text: string, messageId = 2) {
  return {
    update_id: 3,
    message: {
      message_id: messageId,
      from: {
        id: 123,
        is_bot: false,
        first_name: 'Test',
        username: 'testuser',
      },
      chat: { id: 123, type: 'private' as const },
      date: Math.floor(Date.now() / 1000),
      text,
    },
  }
}

function makeCallbackUpdate(data: string) {
  return {
    update_id: 2,
    callback_query: {
      id: 'cb1',
      from: {
        id: 123,
        is_bot: false,
        first_name: 'Test',
        username: 'testuser',
      },
      chat_instance: '123',
      message: {
        message_id: 10,
        from: { id: 999, is_bot: true, first_name: 'Bot' },
        chat: { id: 123, type: 'private' as const },
        date: Math.floor(Date.now() / 1000),
        text: 'old',
      },
      data,
    },
  }
}

let userId: number

beforeEach(() => {
  initDatabase(':memory:')
  userId = findOrCreateUser(123, 'testuser').id
})

describe('registerSearchCommand', () => {
  it('shows no profiles message when user has none', async () => {
    const bot = makeBot(makeMockRegistry())
    await bot.handleUpdate(makeCommandUpdate('/search'))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'sendMessage',
      expect.objectContaining({
        text: expect.stringContaining('нет профилей'),
      })
    )
  })

  it('shows profile selection when profiles exist', async () => {
    const bot = makeBot(makeMockRegistry())
    seedDefaultProfiles(userId)

    await bot.handleUpdate(makeCommandUpdate('/search'))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'sendMessage',
      expect.objectContaining({
        text: expect.stringContaining('Выберите профили'),
      })
    )
  })

  it('toggles profile selection', async () => {
    const bot = makeBot(makeMockRegistry())
    seedDefaultProfiles(userId)
    const profiles = getUserProfiles(userId)

    await bot.handleUpdate(makeCommandUpdate('/search'))
    await bot.handleUpdate(
      makeCallbackUpdate(`search_toggle_${profiles[0].id}`)
    )

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'editMessageReplyMarkup',
      expect.objectContaining({ chat_id: 123 })
    )
  })

  it('rejects search_run with no profiles selected', async () => {
    const bot = makeBot(makeMockRegistry())
    seedDefaultProfiles(userId)

    await bot.handleUpdate(makeCommandUpdate('/search'))
    await bot.handleUpdate(makeCallbackUpdate('search_run'))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'answerCallbackQuery',
      expect.objectContaining({
        text: expect.stringContaining('хотя бы один'),
      })
    )
  })

  it('proceeds to area entry after selecting profile and clicking search', async () => {
    const bot = makeBot(makeMockRegistry())
    seedDefaultProfiles(userId)
    const profiles = getUserProfiles(userId)

    await bot.handleUpdate(makeCommandUpdate('/search'))
    await bot.handleUpdate(
      makeCallbackUpdate(`search_toggle_${profiles[0].id}`)
    )
    await bot.handleUpdate(makeCallbackUpdate('search_run'))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'editMessageText',
      expect.objectContaining({
        text: expect.stringContaining('район'),
      })
    )
  })

  it('performs search and shows results', async () => {
    const results = [
      makeListing({ externalId: 'a' }),
      makeListing({ externalId: 'b' }),
    ]
    const registry = makeMockRegistry(results)
    const bot = makeBot(registry)
    seedDefaultProfiles(userId)
    const profiles = getUserProfiles(userId)

    // Select profile and go to area entry
    await bot.handleUpdate(makeCommandUpdate('/search'))
    await bot.handleUpdate(
      makeCallbackUpdate(`search_toggle_${profiles[0].id}`)
    )
    await bot.handleUpdate(makeCallbackUpdate('search_run'))

    // Enter area
    await bot.handleUpdate(makeTextUpdate('Novi Sad'))

    expect(registry.searchCombined).toHaveBeenCalled()
    // Should have sent "searching" and results messages
    const calls = (bot.telegram.callApi as jest.Mock).mock.calls
    const sendCalls = calls.filter(
      ([method]: string[]) => method === 'sendMessage'
    )
    expect(sendCalls.length).toBeGreaterThanOrEqual(2) // "Searching..." + results
  })

  it('shows no results message on empty results', async () => {
    const registry = makeMockRegistry([])
    const bot = makeBot(registry)
    seedDefaultProfiles(userId)
    const profiles = getUserProfiles(userId)

    await bot.handleUpdate(makeCommandUpdate('/search'))
    await bot.handleUpdate(
      makeCallbackUpdate(`search_toggle_${profiles[0].id}`)
    )
    await bot.handleUpdate(makeCallbackUpdate('search_run'))
    await bot.handleUpdate(makeTextUpdate('Nowhere'))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'sendMessage',
      expect.objectContaining({
        text: expect.stringContaining('Ничего не найдено'),
      })
    )
  })

  it('handles search error gracefully', async () => {
    const registry = makeMockRegistry()
    ;(registry.searchCombined as jest.Mock).mockRejectedValue(
      new Error('Network error')
    )
    const bot = makeBot(registry)
    seedDefaultProfiles(userId)
    const profiles = getUserProfiles(userId)

    await bot.handleUpdate(makeCommandUpdate('/search'))
    await bot.handleUpdate(
      makeCallbackUpdate(`search_toggle_${profiles[0].id}`)
    )
    await bot.handleUpdate(makeCallbackUpdate('search_run'))
    await bot.handleUpdate(makeTextUpdate('Beograd'))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'sendMessage',
      expect.objectContaining({
        text: expect.stringContaining('Ошибка'),
      })
    )
  })
})

describe('startSearchWithProfiles', () => {
  it('creates a search state in entering_area phase', () => {
    const profiles = [
      {
        id: 1,
        user_id: userId,
        name: 'Test',
        keywords: 'k',
        min_price: null,
        max_price: null,
        min_size: null,
        max_size: null,
        min_plot_size: null,
        is_active: 1,
        created_at: '',
        updated_at: '',
      },
    ]
    const state = startSearchWithProfiles(123, profiles, [1])
    expect(state.phase).toBe('entering_area')
    expect(state.selectedProfileIds.has(1)).toBe(true)
  })
})
