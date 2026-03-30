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
           area = ?, city = ?, url = ?, last_seen_at = datetime('now')
       WHERE id = ?`
    ).run(
      listing.title,
      listing.price,
      listing.size,
      listing.plotSize,
      listing.rooms,
      listing.area,
      listing.city,
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
      `INSERT INTO listings (external_id, source, url, title, price, size, plot_size, rooms, area, city)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      listing.city
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
