import { getDatabase } from '../database'

export interface DbSearchProfile {
  id: number
  user_id: number
  name: string
  keywords: string
  min_price: number | null
  max_price: number | null
  min_size: number | null
  max_size: number | null
  min_plot_size: number | null
  is_active: number
  created_at: string
  updated_at: string
}

export function createProfile(
  userId: number,
  name: string,
  keywords: string,
  filters?: {
    minPrice?: number
    maxPrice?: number
    minSize?: number
    maxSize?: number
    minPlotSize?: number
  }
): DbSearchProfile {
  const db = getDatabase()
  const result = db
    .prepare(
      `INSERT INTO search_profiles
       (user_id, name, keywords, min_price, max_price, min_size, max_size, min_plot_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      name,
      keywords,
      filters?.minPrice ?? null,
      filters?.maxPrice ?? null,
      filters?.minSize ?? null,
      filters?.maxSize ?? null,
      filters?.minPlotSize ?? null
    )

  return db
    .prepare('SELECT * FROM search_profiles WHERE id = ?')
    .get(result.lastInsertRowid) as DbSearchProfile
}

export function getUserProfiles(userId: number): DbSearchProfile[] {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM search_profiles WHERE user_id = ? ORDER BY name')
    .all(userId) as DbSearchProfile[]
}

export function getProfileById(
  id: number,
  userId: number
): DbSearchProfile | undefined {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM search_profiles WHERE id = ? AND user_id = ?')
    .get(id, userId) as DbSearchProfile | undefined
}

export function updateProfile(
  id: number,
  userId: number,
  updates: {
    name?: string
    keywords?: string
    minPrice?: number | null
    maxPrice?: number | null
    minSize?: number | null
    maxSize?: number | null
    minPlotSize?: number | null
    isActive?: number
  }
): boolean {
  const db = getDatabase()
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.name !== undefined) {
    fields.push('name = ?')
    values.push(updates.name)
  }
  if (updates.keywords !== undefined) {
    fields.push('keywords = ?')
    values.push(updates.keywords)
  }
  if (updates.minPrice !== undefined) {
    fields.push('min_price = ?')
    values.push(updates.minPrice)
  }
  if (updates.maxPrice !== undefined) {
    fields.push('max_price = ?')
    values.push(updates.maxPrice)
  }
  if (updates.minSize !== undefined) {
    fields.push('min_size = ?')
    values.push(updates.minSize)
  }
  if (updates.maxSize !== undefined) {
    fields.push('max_size = ?')
    values.push(updates.maxSize)
  }
  if (updates.minPlotSize !== undefined) {
    fields.push('min_plot_size = ?')
    values.push(updates.minPlotSize)
  }
  if (updates.isActive !== undefined) {
    fields.push('is_active = ?')
    values.push(updates.isActive)
  }

  if (fields.length === 0) return false

  fields.push("updated_at = datetime('now')")
  values.push(id, userId)

  const result = db
    .prepare(
      `UPDATE search_profiles SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`
    )
    .run(...values)

  return result.changes > 0
}

export function deleteProfile(id: number, userId: number): boolean {
  const db = getDatabase()
  const result = db
    .prepare('DELETE FROM search_profiles WHERE id = ? AND user_id = ?')
    .run(id, userId)
  return result.changes > 0
}

const DEFAULT_PROFILES = [
  { name: 'Banatska kuća', keywords: 'Banatska kuća' },
  { name: 'Gospodska kuća', keywords: 'Gospodska kuća' },
  { name: 'Salonska kuća', keywords: 'Salonska kuća' },
  {
    name: 'Porodična kuća >17 ari',
    keywords: 'Porodična kuća',
    filters: { minPlotSize: 17 },
  },
  { name: 'Visina plafona >3m', keywords: 'Visina plafona 3m' },
]

export function seedDefaultProfiles(userId: number): void {
  const db = getDatabase()
  const existing = db
    .prepare('SELECT COUNT(*) as count FROM search_profiles WHERE user_id = ?')
    .get(userId) as { count: number }

  if (existing.count > 0) return

  for (const profile of DEFAULT_PROFILES) {
    createProfile(
      userId,
      profile.name,
      profile.keywords,
      'filters' in profile ? profile.filters : undefined
    )
  }
}
