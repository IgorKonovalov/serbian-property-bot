import { initDatabase } from '../database'
import {
  addFavorite,
  removeFavorite,
  clearAllFavorites,
  getUserFavorites,
} from './favorites'
import { findOrCreateUser } from './users'
import { upsertListing } from './listings'
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

let userId: number
let listingId: number

beforeEach(() => {
  initDatabase(':memory:')
  userId = findOrCreateUser(1, 'testuser').id
  listingId = upsertListing(makeListing()).dbListing.id
})

describe('addFavorite', () => {
  it('adds a favorite and returns it', () => {
    const fav = addFavorite(userId, listingId)
    expect(fav.user_id).toBe(userId)
    expect(fav.listing_id).toBe(listingId)
    expect(fav.id).toBeGreaterThan(0)
  })

  it('is idempotent — returns existing favorite on duplicate', () => {
    const first = addFavorite(userId, listingId)
    const second = addFavorite(userId, listingId)
    expect(second.id).toBe(first.id)
  })

  it('allows different users to favorite the same listing', () => {
    const otherUser = findOrCreateUser(2).id
    const fav1 = addFavorite(userId, listingId)
    const fav2 = addFavorite(otherUser, listingId)
    expect(fav1.id).not.toBe(fav2.id)
  })
})

describe('removeFavorite', () => {
  it('removes an existing favorite', () => {
    addFavorite(userId, listingId)
    expect(removeFavorite(userId, listingId)).toBe(true)
    expect(getUserFavorites(userId)).toHaveLength(0)
  })

  it('returns false when favorite does not exist', () => {
    expect(removeFavorite(userId, listingId)).toBe(false)
  })
})

describe('clearAllFavorites', () => {
  it('removes all favorites for a user', () => {
    const listing2 = upsertListing(makeListing({ externalId: 'ext-2' }))
      .dbListing.id
    addFavorite(userId, listingId)
    addFavorite(userId, listing2)
    clearAllFavorites(userId)
    expect(getUserFavorites(userId)).toHaveLength(0)
  })

  it('does not affect other users favorites', () => {
    const otherUser = findOrCreateUser(2).id
    addFavorite(userId, listingId)
    addFavorite(otherUser, listingId)
    clearAllFavorites(userId)
    expect(getUserFavorites(otherUser)).toHaveLength(1)
  })
})

describe('getUserFavorites', () => {
  it('returns empty array when no favorites', () => {
    expect(getUserFavorites(userId)).toEqual([])
  })

  it('returns favorites with joined listing data', () => {
    addFavorite(userId, listingId)
    const favs = getUserFavorites(userId)
    expect(favs).toHaveLength(1)
    expect(favs[0].listing_id).toBe(listingId)
    expect(favs[0].title).toBe('Nice apartment')
    expect(favs[0].price).toBe(100000)
    expect(favs[0].source).toBe('test')
    expect(favs[0].url).toBe('https://example.com/1')
  })

  it('returns multiple favorites with listing data', () => {
    const listing2 = upsertListing(
      makeListing({ externalId: 'ext-2', title: 'Second' })
    ).dbListing.id
    const listing3 = upsertListing(
      makeListing({ externalId: 'ext-3', title: 'Third' })
    ).dbListing.id
    addFavorite(userId, listingId)
    addFavorite(userId, listing2)
    addFavorite(userId, listing3)
    const favs = getUserFavorites(userId)
    expect(favs).toHaveLength(3)
    const titles = favs.map((f) => f.title)
    expect(titles).toContain('Nice apartment')
    expect(titles).toContain('Second')
    expect(titles).toContain('Third')
  })
})
