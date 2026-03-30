import { initDatabase, getDatabase } from '../database'
import {
  upsertListing,
  getListingById,
  getPriceChangesForUser,
  getNewListingsSince,
} from './listings'
import { findOrCreateUser } from './users'
import { addFavorite } from './favorites'
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
    imageUrl: 'https://example.com/img.jpg',
    ...overrides,
  }
}

beforeEach(() => {
  initDatabase(':memory:')
})

describe('upsertListing', () => {
  it('inserts a new listing and returns it with an id', () => {
    const result = upsertListing(makeListing())
    expect(result.id).toBeGreaterThan(0)
    expect(result.external_id).toBe('ext-1')
    expect(result.source).toBe('test')
    expect(result.price).toBe(100000)
  })

  it('records initial price in price_history on insert', () => {
    const result = upsertListing(makeListing())
    const db = getDatabase()
    const history = db
      .prepare('SELECT * FROM price_history WHERE listing_id = ?')
      .all(result.id) as { price: number }[]
    expect(history).toHaveLength(1)
    expect(history[0].price).toBe(100000)
  })

  it('does not record price history when price is null', () => {
    const result = upsertListing(makeListing({ price: null }))
    const db = getDatabase()
    const history = db
      .prepare('SELECT * FROM price_history WHERE listing_id = ?')
      .all(result.id)
    expect(history).toHaveLength(0)
  })

  it('updates existing listing on same source+externalId', () => {
    upsertListing(makeListing())
    upsertListing(makeListing({ title: 'Updated title' }))
    // Should not create a second row
    const db = getDatabase()
    const count = db.prepare('SELECT COUNT(*) as c FROM listings').get() as {
      c: number
    }
    expect(count.c).toBe(1)
  })

  it('records price change on update with different price', () => {
    const original = upsertListing(makeListing({ price: 100000 }))
    upsertListing(makeListing({ price: 120000 }))
    const db = getDatabase()
    const history = db
      .prepare('SELECT * FROM price_history WHERE listing_id = ? ORDER BY id')
      .all(original.id) as { price: number }[]
    expect(history).toHaveLength(2)
    expect(history[0].price).toBe(100000)
    expect(history[1].price).toBe(120000)
  })

  it('does not record price change when price stays the same', () => {
    const original = upsertListing(makeListing({ price: 100000 }))
    upsertListing(makeListing({ price: 100000 }))
    const db = getDatabase()
    const history = db
      .prepare('SELECT * FROM price_history WHERE listing_id = ?')
      .all(original.id)
    expect(history).toHaveLength(1)
  })

  it('handles two listings with different sources but same externalId', () => {
    upsertListing(makeListing({ source: 'siteA', externalId: 'x' }))
    upsertListing(makeListing({ source: 'siteB', externalId: 'x' }))
    const db = getDatabase()
    const count = db.prepare('SELECT COUNT(*) as c FROM listings').get() as {
      c: number
    }
    expect(count.c).toBe(2)
  })
})

describe('getListingById', () => {
  it('returns listing by id', () => {
    const inserted = upsertListing(makeListing())
    const found = getListingById(inserted.id)
    expect(found).toBeDefined()
    expect(found!.external_id).toBe('ext-1')
  })

  it('returns undefined for non-existent id', () => {
    expect(getListingById(999)).toBeUndefined()
  })
})

describe('getPriceChangesForUser', () => {
  it('returns empty array when user has no favorites', () => {
    const user = findOrCreateUser(1)
    expect(getPriceChangesForUser(user.id)).toEqual([])
  })

  it('detects price change on favorited listing', () => {
    const user = findOrCreateUser(1)
    const listing = upsertListing(makeListing({ price: 100000 }))
    addFavorite(user.id, listing.id)

    // The initial insert already recorded price at datetime('now').
    // We need the old record to be before the new one, and the new one within last day.
    const db = getDatabase()
    // Backdate the initial price_history record
    db.prepare(
      "UPDATE price_history SET recorded_at = datetime('now', '-2 hours') WHERE listing_id = ?"
    ).run(listing.id)
    // Insert new price within last day
    db.prepare(
      "INSERT INTO price_history (listing_id, price, recorded_at) VALUES (?, ?, datetime('now'))"
    ).run(listing.id, 90000)

    const changes = getPriceChangesForUser(user.id)
    expect(changes).toHaveLength(1)
    expect(changes[0].old_price).toBe(100000)
    expect(changes[0].new_price).toBe(90000)
    expect(changes[0].listing_id).toBe(listing.id)
  })

  it('ignores price changes on non-favorited listings', () => {
    const user = findOrCreateUser(1)
    const listing = upsertListing(makeListing({ price: 100000 }))
    const db = getDatabase()
    db.prepare(
      "UPDATE price_history SET recorded_at = datetime('now', '-2 hours') WHERE listing_id = ?"
    ).run(listing.id)
    db.prepare(
      "INSERT INTO price_history (listing_id, price, recorded_at) VALUES (?, ?, datetime('now'))"
    ).run(listing.id, 90000)

    expect(getPriceChangesForUser(user.id)).toEqual([])
  })
})

describe('getNewListingsSince', () => {
  it('returns listings inserted recently', () => {
    upsertListing(makeListing({ externalId: 'a' }))
    upsertListing(makeListing({ externalId: 'b' }))
    const results = getNewListingsSince(24)
    expect(results).toHaveLength(2)
  })

  it('returns empty when no listings exist', () => {
    expect(getNewListingsSince(24)).toEqual([])
  })
})
