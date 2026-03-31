import { initDatabase } from '../db/database'
import {
  buildDigestSummary,
  buildDigestData,
  buildDigestForUser,
  buildNewListingsMessage,
  buildPriceChangesMessage,
  sendDigestToAll,
  refreshFavoritePrices,
  type DigestData,
} from './digest'
import type { Listing } from '../parsers/types'
import type { PriceChange } from '../db/queries/listings'
import { findOrCreateUser } from '../db/queries/users'
import {
  createProfile,
  getUserProfiles,
  deleteProfile,
} from '../db/queries/search-profiles'
import { upsertListing } from '../db/queries/listings'
import { addFavorite } from '../db/queries/favorites'
import type { ParserRegistry } from '../parsers/registry'

function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    externalId: 'ext-1',
    source: 'halooglasi',
    url: 'https://example.com/1',
    title: 'Stan u centru',
    price: 85000,
    size: 60,
    plotSize: null,
    rooms: 2,
    area: 'Centar',
    city: 'Novi Sad',
    imageUrl: null,
    ...overrides,
  }
}

function makePriceChange(overrides: Partial<PriceChange> = {}): PriceChange {
  return {
    listing_id: 1,
    title: 'Stan u centru',
    url: 'https://example.com/1',
    source: 'halooglasi',
    old_price: 100000,
    new_price: 90000,
    city: 'Novi Sad',
    area: 'Centar',
    ...overrides,
  }
}

beforeEach(() => {
  initDatabase(':memory:')
})

describe('buildDigestSummary', () => {
  it('returns null when no data', () => {
    const data: DigestData = { priceChanges: [], newListings: [] }
    expect(buildDigestSummary(data)).toBeNull()
  })

  it('includes new listings count and button when present', () => {
    const data: DigestData = {
      priceChanges: [],
      newListings: [makeListing()],
    }
    const result = buildDigestSummary(data)
    expect(result).not.toBeNull()
    expect(result!.text).toContain('Новых: 1')
    expect(result!.keyboard.inline_keyboard).toHaveLength(1)
    expect(result!.keyboard.inline_keyboard[0][0].callback_data).toBe(
      'digest_new'
    )
  })

  it('includes price changes count and button when present', () => {
    const data: DigestData = {
      priceChanges: [makePriceChange()],
      newListings: [],
    }
    const result = buildDigestSummary(data)
    expect(result).not.toBeNull()
    expect(result!.text).toContain('Изменений цен: 1')
    expect(result!.keyboard.inline_keyboard).toHaveLength(1)
    expect(result!.keyboard.inline_keyboard[0][0].callback_data).toBe(
      'digest_prices'
    )
  })

  it('includes both buttons when both data types present', () => {
    const data: DigestData = {
      priceChanges: [makePriceChange()],
      newListings: [makeListing()],
    }
    const result = buildDigestSummary(data)
    expect(result).not.toBeNull()
    expect(result!.keyboard.inline_keyboard).toHaveLength(2)
  })
})

describe('buildNewListingsMessage', () => {
  it('formats a single listing', () => {
    const msg = buildNewListingsMessage([makeListing()])
    expect(msg).toContain('Новые объявления')
    expect(msg).toContain('2 комн.')
    expect(msg).toContain('60м²')
    expect(msg).toContain('85')
    expect(msg).toContain('Novi Sad')
    expect(msg).toContain('halooglasi')
  })

  it('limits output to 10 listings', () => {
    const listings = Array.from({ length: 15 }, (_, i) =>
      makeListing({ externalId: `ext-${i}`, title: `Listing ${i}` })
    )
    const msg = buildNewListingsMessage(listings)
    // Should have entries numbered 1-10
    expect(msg).toContain('10.')
    expect(msg).not.toContain('11.')
  })

  it('handles listing with null fields', () => {
    const msg = buildNewListingsMessage([
      makeListing({
        rooms: null,
        size: null,
        price: null,
        city: null,
        area: null,
      }),
    ])
    expect(msg).toContain('Цена не указана')
    expect(msg).toContain('Н/Д')
  })
})

describe('buildPriceChangesMessage', () => {
  it('formats a price decrease', () => {
    const msg = buildPriceChangesMessage([
      makePriceChange({ old_price: 100000, new_price: 90000 }),
    ])
    expect(msg).toContain('Изменения цен')
    expect(msg).toContain('📉')
    expect(msg).toContain('-10.0%')
    expect(msg).toContain('Stan u centru')
  })

  it('formats a price increase', () => {
    const msg = buildPriceChangesMessage([
      makePriceChange({ old_price: 100000, new_price: 120000 }),
    ])
    expect(msg).toContain('📈')
    expect(msg).toContain('+20.0%')
  })

  it('shows fallback title when null', () => {
    const msg = buildPriceChangesMessage([makePriceChange({ title: null })])
    expect(msg).toContain('Без названия')
  })

  it('shows fallback location when city and area are null', () => {
    const msg = buildPriceChangesMessage([
      makePriceChange({ city: null, area: null }),
    ])
    expect(msg).toContain('Н/Д')
  })
})

function makeRegistry(results: Listing[] = []): ParserRegistry {
  return {
    searchCombined: jest.fn().mockResolvedValue(results),
  } as unknown as ParserRegistry
}

function makeBotMock() {
  return {
    telegram: {
      sendMessage: jest.fn().mockResolvedValue({}),
    },
  } as any
}

describe('buildDigestData', () => {
  it('returns empty data when user has no profiles', async () => {
    const user = findOrCreateUser(100, 'test')
    const data = await buildDigestData(user.id, makeRegistry())
    expect(data.priceChanges).toEqual([])
    expect(data.newListings).toEqual([])
  })

  it('calls registry.searchCombined with active profile params', async () => {
    const user = findOrCreateUser(101, 'test')
    createProfile(user.id, 'Houses', 'kuća', {
      minPrice: 50000,
      maxPrice: 200000,
    })
    const registry = makeRegistry([makeListing()])
    const data = await buildDigestData(user.id, registry)
    expect(registry.searchCombined).toHaveBeenCalledTimes(1)
    expect(data.newListings).toHaveLength(1)
  })

  it('upserts returned listings into DB', async () => {
    const user = findOrCreateUser(102, 'test')
    createProfile(user.id, 'Test', 'kuća')
    const listing = makeListing({ externalId: 'upsert-test' })
    await buildDigestData(user.id, makeRegistry([listing]))
    // Verify it was inserted by upserting again (should not throw)
    const dbListing = upsertListing(listing)
    expect(dbListing).toBeDefined()
  })

  it('handles registry error gracefully', async () => {
    const user = findOrCreateUser(103, 'test')
    createProfile(user.id, 'Test', 'kuća')
    const registry = {
      searchCombined: jest.fn().mockRejectedValue(new Error('network error')),
    } as unknown as ParserRegistry
    const data = await buildDigestData(user.id, registry)
    expect(data.newListings).toEqual([])
  })
})

describe('buildDigestForUser', () => {
  it('returns null when no data', async () => {
    const user = findOrCreateUser(200, 'test')
    const result = await buildDigestForUser(user.id, makeRegistry())
    expect(result).toBeNull()
  })

  it('returns DigestData when there are new listings', async () => {
    const user = findOrCreateUser(201, 'test')
    createProfile(user.id, 'Test', 'kuća')
    const result = await buildDigestForUser(
      user.id,
      makeRegistry([makeListing()])
    )
    expect(result).not.toBeNull()
    expect(result!.newListings).toHaveLength(1)
  })
})

describe('sendDigestToAll', () => {
  it('sends digest to users with data', async () => {
    const user = findOrCreateUser(300, 'sender')
    createProfile(user.id, 'Test', 'kuća')
    const bot = makeBotMock()
    await sendDigestToAll(bot, makeRegistry([makeListing()]))
    expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
      300,
      expect.any(String),
      expect.objectContaining({ parse_mode: 'HTML' })
    )
  })

  it('does not send when user has no digest data', async () => {
    findOrCreateUser(301, 'empty')
    const bot = makeBotMock()
    await sendDigestToAll(bot, makeRegistry())
    expect(bot.telegram.sendMessage).not.toHaveBeenCalled()
  })

  it('continues sending to other users if one fails', async () => {
    findOrCreateUser(302, 'fail')
    findOrCreateUser(303, 'ok')
    const bot = makeBotMock()
    bot.telegram.sendMessage
      .mockRejectedValueOnce(new Error('blocked'))
      .mockResolvedValueOnce({})
    await sendDigestToAll(bot, makeRegistry([makeListing()]))
    // Should have attempted both (both have default profiles)
    expect(bot.telegram.sendMessage).toHaveBeenCalledTimes(2)
  })
})

describe('refreshFavoritePrices', () => {
  it('refreshes prices for users with favorites and active profiles', async () => {
    const user = findOrCreateUser(400, 'refresh')
    createProfile(user.id, 'Test', 'kuća')
    const dbListing = upsertListing(makeListing({ externalId: 'fav-1' }))
    addFavorite(user.id, dbListing.id)
    const registry = makeRegistry([
      makeListing({ externalId: 'fav-1', price: 90000 }),
    ])
    const bot = makeBotMock()
    await refreshFavoritePrices(bot, registry)
    expect(registry.searchCombined).toHaveBeenCalled()
  })

  it('skips users with no favorites', async () => {
    findOrCreateUser(401, 'nofav')
    const registry = makeRegistry()
    const bot = makeBotMock()
    await refreshFavoritePrices(bot, registry)
    expect(registry.searchCombined).not.toHaveBeenCalled()
  })

  it('skips users with no active profiles', async () => {
    const user = findOrCreateUser(402, 'noprofile')
    // Delete all default profiles
    const profiles = getUserProfiles(user.id)
    for (const p of profiles) {
      deleteProfile(p.id, user.id)
    }
    const dbListing = upsertListing(
      makeListing({ externalId: 'fav-noprofile' })
    )
    addFavorite(user.id, dbListing.id)
    const registry = makeRegistry()
    const bot = makeBotMock()
    await refreshFavoritePrices(bot, registry)
    expect(registry.searchCombined).not.toHaveBeenCalled()
  })

  it('handles registry error gracefully', async () => {
    const user = findOrCreateUser(403, 'err')
    createProfile(user.id, 'Test', 'kuća')
    const dbListing = upsertListing(makeListing({ externalId: 'fav-err' }))
    addFavorite(user.id, dbListing.id)
    const registry = {
      searchCombined: jest.fn().mockRejectedValue(new Error('fail')),
    } as unknown as ParserRegistry
    const bot = makeBotMock()
    // Should not throw
    await refreshFavoritePrices(bot, registry)
  })
})
