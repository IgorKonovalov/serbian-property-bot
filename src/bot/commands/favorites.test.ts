import { Telegraf } from 'telegraf'
import { initDatabase } from '../../db/database'
import { findOrCreateUser } from '../../db/queries/users'
import { upsertListing } from '../../db/queries/listings'
import { addFavorite, getUserFavorites } from '../../db/queries/favorites'
import { registerFavoritesCommand } from './favorites'
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

function makeBot(): Telegraf {
  const bot = new Telegraf('fake-token')
  registerFavoritesCommand(bot)
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

describe('registerFavoritesCommand', () => {
  it('shows empty message when no favorites', async () => {
    const bot = makeBot()
    findOrCreateUser(123, 'testuser')
    await bot.handleUpdate(makeCommandUpdate('/favorites'))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'sendMessage',
      expect.objectContaining({
        chat_id: 123,
        text: expect.stringContaining('нет сохранённых'),
      })
    )
  })

  it('shows favorites list when favorites exist', async () => {
    const bot = makeBot()
    const user = findOrCreateUser(123, 'testuser')
    const { dbListing: listing } = upsertListing(makeListing())
    addFavorite(user.id, listing.id)

    await bot.handleUpdate(makeCommandUpdate('/favorites'))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'sendMessage',
      expect.objectContaining({
        chat_id: 123,
        text: expect.stringContaining('Избранное'),
        parse_mode: 'HTML',
      })
    )
  })

  it('removes a favorite via callback', async () => {
    const bot = makeBot()
    const user = findOrCreateUser(123, 'testuser')
    const { dbListing: listing } = upsertListing(makeListing())
    addFavorite(user.id, listing.id)

    await bot.handleUpdate(makeCallbackUpdate(`fav_rm_${listing.id}`))

    expect(getUserFavorites(user.id)).toHaveLength(0)
  })

  it('clears all favorites via confirm callback', async () => {
    const bot = makeBot()
    const user = findOrCreateUser(123, 'testuser')
    const { dbListing: l1 } = upsertListing(makeListing({ externalId: 'a' }))
    const { dbListing: l2 } = upsertListing(makeListing({ externalId: 'b' }))
    addFavorite(user.id, l1.id)
    addFavorite(user.id, l2.id)

    await bot.handleUpdate(makeCallbackUpdate('fav_clearok'))

    expect(getUserFavorites(user.id)).toHaveLength(0)
  })

  it('shows confirmation on fav_clearall', async () => {
    const bot = makeBot()
    const user = findOrCreateUser(123, 'testuser')
    const { dbListing: listing } = upsertListing(makeListing())
    addFavorite(user.id, listing.id)

    await bot.handleUpdate(makeCallbackUpdate('fav_clearall'))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'editMessageText',
      expect.objectContaining({
        chat_id: 123,
        text: expect.stringContaining('Удалить все'),
      })
    )
  })

  it('handles fav_cancelclear callback', async () => {
    const bot = makeBot()
    const user = findOrCreateUser(123, 'testuser')
    const { dbListing: listing } = upsertListing(makeListing())
    addFavorite(user.id, listing.id)

    await bot.handleUpdate(makeCallbackUpdate('fav_cancelclear'))

    // Should show favorites list again
    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'editMessageText',
      expect.objectContaining({ chat_id: 123 })
    )
  })

  it('handles pagination callback', async () => {
    const bot = makeBot()
    const user = findOrCreateUser(123, 'testuser')
    // Create 6 listings to trigger pagination (FAVORITES_PER_PAGE = 5)
    for (let i = 0; i < 6; i++) {
      const { dbListing: listing } = upsertListing(
        makeListing({ externalId: `ext-${i}` })
      )
      addFavorite(user.id, listing.id)
    }

    await bot.handleUpdate(makeCallbackUpdate('fpage_1'))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'editMessageText',
      expect.objectContaining({ chat_id: 123, parse_mode: 'HTML' })
    )
  })
})
