import { getDatabase } from '../database'

interface DbUserSetting {
  id: number
  user_id: number
  key: string
  value: string
  updated_at: string
}

export function getSetting(userId: number, key: string): string | null {
  const db = getDatabase()
  const row = db
    .prepare('SELECT value FROM user_settings WHERE user_id = ? AND key = ?')
    .get(userId, key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(userId: number, key: string, value: string): void {
  const db = getDatabase()
  db.prepare(
    `INSERT INTO user_settings (user_id, key, value, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(userId, key, value)
}

export function deleteSetting(userId: number, key: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM user_settings WHERE user_id = ? AND key = ?').run(
    userId,
    key
  )
}

export function getEnabledSites(
  userId: number,
  allSources: string[]
): string[] {
  const db = getDatabase()
  const rows = db
    .prepare(
      "SELECT key, value FROM user_settings WHERE user_id = ? AND key LIKE 'site_%'"
    )
    .all(userId) as Pick<DbUserSetting, 'key' | 'value'>[]

  // If user has no site settings at all, all sites are enabled by default
  if (rows.length === 0) return allSources

  const settings = new Map(rows.map((r) => [r.key, r.value]))

  return allSources.filter((source) => {
    const val = settings.get(`site_${source}`)
    // Absent key = enabled (default), '0' = disabled
    return val !== '0'
  })
}

export function isSiteEnabled(userId: number, source: string): boolean {
  const val = getSetting(userId, `site_${source}`)
  // null (no setting) = enabled by default
  return val !== '0'
}

export function toggleSite(userId: number, source: string): boolean {
  const current = isSiteEnabled(userId, source)
  setSetting(userId, `site_${source}`, current ? '0' : '1')
  return !current
}

export function getAllSettings(userId: number): Record<string, string> {
  const db = getDatabase()
  const rows = db
    .prepare('SELECT key, value FROM user_settings WHERE user_id = ?')
    .all(userId) as Pick<DbUserSetting, 'key' | 'value'>[]

  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.key] = row.value
  }
  return result
}
