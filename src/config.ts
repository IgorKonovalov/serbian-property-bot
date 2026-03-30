import dotenv from 'dotenv'

dotenv.config()

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required env var: ${key}`)
  return value
}

export const config = {
  botToken: requireEnv('BOT_TOKEN'),
  dbPath: process.env['DB_PATH'] ?? 'data/property-bot.db',
} as const
