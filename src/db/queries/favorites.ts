import { getDatabase } from '../database'

interface DbFavorite {
  id: number
  user_id: number
  listing_id: number
  added_at: string
}

interface FavoriteWithListing {
  favorite_id: number
  listing_id: number
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
  added_at: string
}

export function addFavorite(userId: number, listingId: number): DbFavorite {
  const db = getDatabase()

  const existing = db
    .prepare('SELECT * FROM favorites WHERE user_id = ? AND listing_id = ?')
    .get(userId, listingId) as DbFavorite | undefined

  if (existing) return existing

  const result = db
    .prepare('INSERT INTO favorites (user_id, listing_id) VALUES (?, ?)')
    .run(userId, listingId)

  return {
    id: result.lastInsertRowid as number,
    user_id: userId,
    listing_id: listingId,
    added_at: new Date().toISOString(),
  }
}

export function removeFavorite(userId: number, listingId: number): boolean {
  const db = getDatabase()
  const result = db
    .prepare('DELETE FROM favorites WHERE user_id = ? AND listing_id = ?')
    .run(userId, listingId)
  return result.changes > 0
}

export function getUserFavorites(userId: number): FavoriteWithListing[] {
  const db = getDatabase()
  return db
    .prepare(
      `SELECT f.id as favorite_id, l.id as listing_id,
              l.external_id, l.source, l.url, l.title,
              l.price, l.size, l.plot_size, l.rooms,
              l.area, l.city, l.image_url, f.added_at
       FROM favorites f
       JOIN listings l ON f.listing_id = l.id
       WHERE f.user_id = ?
       ORDER BY f.added_at DESC`
    )
    .all(userId) as FavoriteWithListing[]
}
