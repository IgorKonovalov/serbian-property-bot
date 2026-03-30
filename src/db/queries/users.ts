import { getDatabase } from '../database'

interface DbUser {
  id: number
  telegram_id: number
  username: string | null
  created_at: string
}

export function findOrCreateUser(
  telegramId: number,
  username?: string
): DbUser {
  const db = getDatabase()

  const existing = db
    .prepare('SELECT * FROM users WHERE telegram_id = ?')
    .get(telegramId) as DbUser | undefined

  if (existing) return existing

  const result = db
    .prepare('INSERT INTO users (telegram_id, username) VALUES (?, ?)')
    .run(telegramId, username ?? null)

  return {
    id: result.lastInsertRowid as number,
    telegram_id: telegramId,
    username: username ?? null,
    created_at: new Date().toISOString(),
  }
}

export function getUserByTelegramId(telegramId: number): DbUser | undefined {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM users WHERE telegram_id = ?')
    .get(telegramId) as DbUser | undefined
}
