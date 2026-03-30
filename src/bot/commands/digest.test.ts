import { Telegraf } from 'telegraf'
import { initDatabase } from '../../db/database'
import { findOrCreateUser } from '../../db/queries/users'
import { seedDefaultProfiles } from '../../db/queries/search-profiles'
import { registerDigestCommand } from './digest'
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
  registerDigestCommand(bot, registry)
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

beforeEach(() => {
  initDatabase(':memory:')
})

describe('registerDigestCommand', () => {
  it('shows empty digest when no data', async () => {
    const bot = makeBot(makeMockRegistry())
    findOrCreateUser(123, 'testuser')

    await bot.handleUpdate(makeCommandUpdate('/digest'))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'sendMessage',
      expect.objectContaining({
        text: expect.stringContaining('без изменений'),
      })
    )
  })

  it('shows digest with new listings when results found', async () => {
    const results = [
      makeListing({ externalId: 'a' }),
      makeListing({ externalId: 'b' }),
    ]
    const bot = makeBot(makeMockRegistry(results))
    const user = findOrCreateUser(123, 'testuser')
    seedDefaultProfiles(user.id)

    await bot.handleUpdate(makeCommandUpdate('/digest'))

    const calls = (bot.telegram.callApi as jest.Mock).mock.calls
    const sendCalls = calls.filter(
      ([method]: string[]) => method === 'sendMessage'
    )
    // Should send loading + digest summary
    expect(sendCalls.length).toBeGreaterThanOrEqual(2)
  })

  it('handles digest error gracefully', async () => {
    const registry = makeMockRegistry()
    ;(registry.searchCombined as jest.Mock).mockRejectedValue(new Error('fail'))
    const bot = makeBot(registry)
    const user = findOrCreateUser(123, 'testuser')
    seedDefaultProfiles(user.id)

    await bot.handleUpdate(makeCommandUpdate('/digest'))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'sendMessage',
      expect.objectContaining({
        text: expect.stringContaining('Ошибка'),
      })
    )
  })

  it('handles digest_new callback with empty cache', async () => {
    const bot = makeBot(makeMockRegistry())
    findOrCreateUser(123, 'testuser')

    await bot.handleUpdate(makeCallbackUpdate('digest_new'))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'answerCallbackQuery',
      expect.objectContaining({
        text: expect.stringContaining('без изменений'),
      })
    )
  })

  it('handles digest_prices callback with empty cache', async () => {
    const bot = makeBot(makeMockRegistry())
    findOrCreateUser(123, 'testuser')

    await bot.handleUpdate(makeCallbackUpdate('digest_prices'))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'answerCallbackQuery',
      expect.objectContaining({
        text: expect.stringContaining('без изменений'),
      })
    )
  })
})
