import { initDatabase } from '../db/database'
import {
  buildDigestSummary,
  buildNewListingsMessage,
  buildPriceChangesMessage,
  type DigestData,
} from './digest'
import type { Listing } from '../parsers/types'
import type { PriceChange } from '../db/queries/listings'

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
