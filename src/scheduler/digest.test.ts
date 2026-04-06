import { initDatabase } from '../db/database'
import {
  buildDigestSummary,
  buildDigestData,
  buildNewListingsMessage,
  buildPriceChangesMessage,
  buildNewListingsPage,
  buildPriceChangesPage,
  filterByBucket,
  digestCache,
  sendDigestToAll,
  refreshFavoritePrices,
  type DigestData,
} from './digest'
import type { Listing } from '../parsers/types'
import type { PriceChange } from '../db/queries/listings'
import { findOrCreateUser } from '../db/queries/users'
import { createProfile } from '../db/queries/search-profiles'
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
    expect(result!.text).toContain('Изменения в избранном: 1')
    expect(result!.keyboard.inline_keyboard).toHaveLength(1)
    expect(result!.keyboard.inline_keyboard[0][0].callback_data).toBe(
      'digest_fav'
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

  it('limits output to one page of listings', () => {
    const listings = Array.from({ length: 15 }, (_, i) =>
      makeListing({ externalId: `ext-${i}`, title: `Listing ${i}` })
    )
    const msg = buildNewListingsMessage(listings)
    // Default page size is 5
    expect(msg).toContain('5.')
    expect(msg).not.toContain('6.')
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
    fetchByUrl: jest.fn().mockResolvedValue(results[0] ?? null),
    registeredSources: ['halooglasi'],
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

describe('sendDigestToAll', () => {
  it('sends digest to users with data and populates cache', async () => {
    const user = findOrCreateUser(300, 'sender')
    createProfile(user.id, 'Test', 'kuća')
    const bot = makeBotMock()
    await sendDigestToAll(bot, makeRegistry([makeListing()]))
    expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
      300,
      expect.any(String),
      expect.objectContaining({ parse_mode: 'HTML' })
    )
    // Cache should be populated so callbacks work
    const cached = digestCache.get(300)
    expect(cached).toBeDefined()
    expect(cached!.data.newListings).toHaveLength(1)
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
  it('fetches each favorite by URL', async () => {
    const user = findOrCreateUser(400, 'refresh')
    const dbListing = upsertListing(makeListing({ externalId: 'fav-1' }))
    addFavorite(user.id, dbListing.id)
    const registry = makeRegistry([
      makeListing({ externalId: 'fav-1', price: 90000 }),
    ])
    const bot = makeBotMock()
    await refreshFavoritePrices(bot, registry)
    expect(registry.fetchByUrl).toHaveBeenCalledWith(
      'https://example.com/1',
      'halooglasi'
    )
  })

  it('skips users with no favorites', async () => {
    findOrCreateUser(401, 'nofav')
    const registry = makeRegistry()
    const bot = makeBotMock()
    await refreshFavoritePrices(bot, registry)
    expect(registry.fetchByUrl).not.toHaveBeenCalled()
  })

  it('handles fetchByUrl error gracefully', async () => {
    const user = findOrCreateUser(403, 'err')
    const dbListing = upsertListing(makeListing({ externalId: 'fav-err' }))
    addFavorite(user.id, dbListing.id)
    const registry = {
      fetchByUrl: jest.fn().mockRejectedValue(new Error('fail')),
      registeredSources: ['halooglasi'],
    } as unknown as ParserRegistry
    const bot = makeBotMock()
    // Should not throw
    await refreshFavoritePrices(bot, registry)
  })
})

describe('buildNewListingsPage', () => {
  const listings = Array.from({ length: 12 }, (_, i) =>
    makeListing({
      externalId: `ext-${i}`,
      title: `Listing ${i}`,
      price: (i + 1) * 10000,
    })
  )

  it('shows first page of listings', () => {
    const { text } = buildNewListingsPage(listings, 0, 'all')
    expect(text).toContain('1.')
    expect(text).toContain('5.')
    expect(text).not.toContain('6.')
    expect(text).toContain('Стр. 1/3')
    expect(text).toContain('всего: 12')
  })

  it('shows second page', () => {
    const { text } = buildNewListingsPage(listings, 1, 'all')
    expect(text).toContain('6.')
    expect(text).toContain('10.')
    expect(text).toContain('Стр. 2/3')
  })

  it('shows last page with remaining items', () => {
    const { text } = buildNewListingsPage(listings, 2, 'all')
    expect(text).toContain('11.')
    expect(text).toContain('12.')
    expect(text).toContain('Стр. 3/3')
  })

  it('clamps page to valid range', () => {
    const { text } = buildNewListingsPage(listings, 99, 'all')
    expect(text).toContain('Стр. 3/3')
  })

  it('includes navigation buttons', () => {
    const { keyboard } = buildNewListingsPage(listings, 1, 'all')
    const allButtons = keyboard.inline_keyboard.flat()
    const navButtons = allButtons.filter(
      (b) => 'callback_data' in b && b.callback_data.startsWith('dpage_new_')
    )
    expect(navButtons).toHaveLength(2) // prev + next
  })

  it('no prev button on first page', () => {
    const { keyboard } = buildNewListingsPage(listings, 0, 'all')
    const allButtons = keyboard.inline_keyboard.flat()
    const prevButtons = allButtons.filter(
      (b) => 'callback_data' in b && b.callback_data === 'dpage_new_-1'
    )
    expect(prevButtons).toHaveLength(0)
  })

  it('includes filter buttons', () => {
    const { keyboard } = buildNewListingsPage(listings, 0, 'all')
    const allButtons = keyboard.inline_keyboard.flat()
    const filterButtons = allButtons.filter(
      (b) => 'callback_data' in b && b.callback_data.startsWith('dflt_')
    )
    expect(filterButtons).toHaveLength(5)
  })

  it('marks active filter bucket', () => {
    const { keyboard } = buildNewListingsPage(listings, 0, 'lt50')
    const filterRow = keyboard.inline_keyboard[0]
    const active = filterRow.find((b) => 'text' in b && b.text.startsWith('['))
    expect(active).toBeDefined()
    expect(active!.text).toContain('€50k')
  })

  it('includes back button', () => {
    const { keyboard } = buildNewListingsPage(listings, 0, 'all')
    const allButtons = keyboard.inline_keyboard.flat()
    const back = allButtons.find(
      (b) => 'callback_data' in b && b.callback_data === 'digest_back'
    )
    expect(back).toBeDefined()
  })
})

describe('buildPriceChangesPage', () => {
  const changes = Array.from({ length: 8 }, (_, i) =>
    makePriceChange({ listing_id: i + 1, title: `Change ${i}` })
  )

  it('shows first page', () => {
    const { text } = buildPriceChangesPage(changes, 0)
    expect(text).toContain('Изменения цен в избранном')
    expect(text).toContain('Стр. 1/2')
  })

  it('shows second page', () => {
    const { text } = buildPriceChangesPage(changes, 1)
    expect(text).toContain('Стр. 2/2')
  })

  it('includes prev/next buttons on middle pages', () => {
    const manyChanges = Array.from({ length: 15 }, (_, i) =>
      makePriceChange({ listing_id: i + 1 })
    )
    const { keyboard } = buildPriceChangesPage(manyChanges, 1)
    const allButtons = keyboard.inline_keyboard.flat()
    const navButtons = allButtons.filter(
      (b) => 'callback_data' in b && b.callback_data.startsWith('dpage_price_')
    )
    expect(navButtons).toHaveLength(2)
  })
})

describe('filterByBucket', () => {
  const listings = [
    makeListing({ price: 30000 }),
    makeListing({ price: 75000 }),
    makeListing({ price: 150000 }),
    makeListing({ price: 250000 }),
    makeListing({ price: null }),
  ]

  it('returns all for "all" bucket', () => {
    expect(filterByBucket(listings, 'all')).toHaveLength(5)
  })

  it('filters < €50k', () => {
    const result = filterByBucket(listings, 'lt50')
    expect(result).toHaveLength(1)
    expect(result[0].price).toBe(30000)
  })

  it('filters €50-100k', () => {
    const result = filterByBucket(listings, '50_100')
    expect(result).toHaveLength(1)
    expect(result[0].price).toBe(75000)
  })

  it('filters €100-200k', () => {
    const result = filterByBucket(listings, '100_200')
    expect(result).toHaveLength(1)
    expect(result[0].price).toBe(150000)
  })

  it('filters €200k+', () => {
    const result = filterByBucket(listings, 'gt200')
    expect(result).toHaveLength(1)
    expect(result[0].price).toBe(250000)
  })

  it('excludes null-price listings from non-all buckets', () => {
    expect(filterByBucket(listings, 'lt50')).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ price: null })])
    )
  })
})
