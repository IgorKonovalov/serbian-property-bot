import { getDatabase } from '../database'
import type { Listing } from '../../parsers/types'

interface DbListing {
  id: number
  external_id: string
  source: string
  url: string
  title: string | null
  price: number | null
  size: number | null
  plot_size: number | null
  rooms: number | null
  area: string | null
  city: string | null
  image_url: string | null
  raw_data: string | null
  first_seen_at: string
  last_seen_at: string
}

export function upsertListing(listing: Listing): DbListing {
  const db = getDatabase()

  const existing = db
    .prepare('SELECT * FROM listings WHERE source = ? AND external_id = ?')
    .get(listing.source, listing.externalId) as DbListing | undefined

  if (existing) {
    db.prepare(
      `UPDATE listings
       SET title = ?, price = ?, size = ?, plot_size = ?, rooms = ?,
           area = ?, city = ?, image_url = ?, url = ?, last_seen_at = datetime('now')
       WHERE id = ?`
    ).run(
      listing.title,
      listing.price,
      listing.size,
      listing.plotSize,
      listing.rooms,
      listing.area,
      listing.city,
      listing.imageUrl,
      listing.url,
      existing.id
    )

    // Record price change
    if (listing.price !== null && listing.price !== existing.price) {
      db.prepare(
        'INSERT INTO price_history (listing_id, price) VALUES (?, ?)'
      ).run(existing.id, listing.price)
    }

    return { ...existing, ...listing, id: existing.id } as unknown as DbListing
  }

  const result = db
    .prepare(
      `INSERT INTO listings (external_id, source, url, title, price, size, plot_size, rooms, area, city, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      listing.externalId,
      listing.source,
      listing.url,
      listing.title,
      listing.price,
      listing.size,
      listing.plotSize,
      listing.rooms,
      listing.area,
      listing.city,
      listing.imageUrl
    )

  const id = result.lastInsertRowid as number

  // Record initial price
  if (listing.price !== null) {
    db.prepare(
      'INSERT INTO price_history (listing_id, price) VALUES (?, ?)'
    ).run(id, listing.price)
  }

  return db.prepare('SELECT * FROM listings WHERE id = ?').get(id) as DbListing
}

export function getListingById(id: number): DbListing | undefined {
  const db = getDatabase()
  return db.prepare('SELECT * FROM listings WHERE id = ?').get(id) as
    | DbListing
    | undefined
}

export interface PriceChange {
  listing_id: number
  title: string | null
  url: string
  source: string
  old_price: number
  new_price: number
  city: string | null
  area: string | null
}

export function getPriceChangesForUser(userId: number): PriceChange[] {
  const db = getDatabase()
  return db
    .prepare(
      `SELECT l.id as listing_id, l.title, l.url, l.source, l.city, l.area,
              ph_prev.price as old_price, ph_last.price as new_price
       FROM favorites f
       JOIN listings l ON f.listing_id = l.id
       JOIN price_history ph_last ON ph_last.listing_id = l.id
       LEFT JOIN price_history ph_prev ON ph_prev.listing_id = l.id
         AND ph_prev.recorded_at < ph_last.recorded_at
       WHERE f.user_id = ?
         AND ph_last.recorded_at = (
           SELECT MAX(recorded_at) FROM price_history WHERE listing_id = l.id
         )
         AND ph_prev.recorded_at = (
           SELECT MAX(recorded_at) FROM price_history
           WHERE listing_id = l.id AND recorded_at < ph_last.recorded_at
         )
         AND ph_prev.price != ph_last.price
         AND ph_last.recorded_at > datetime('now', '-1 day')`
    )
    .all(userId) as PriceChange[]
}

export function getNewListingsSince(hoursAgo: number): DbListing[] {
  const db = getDatabase()
  return db
    .prepare(
      `SELECT * FROM listings
       WHERE first_seen_at > datetime('now', '-' || ? || ' hours')
       ORDER BY first_seen_at DESC`
    )
    .all(hoursAgo) as DbListing[]
}
