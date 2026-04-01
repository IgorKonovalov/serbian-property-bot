import dotenv from 'dotenv'

dotenv.config()

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required env var: ${key}`)
  return value
}

function optionalInt(key: string, fallback: number): number {
  const raw = process.env[key]
  if (!raw) return fallback
  const parsed = parseInt(raw, 10)
  return isNaN(parsed) ? fallback : parsed
}

export const config = {
  botToken: requireEnv('BOT_TOKEN'),
  dbPath: process.env['DB_PATH'] ?? 'data/property-bot.db',

  // Timing
  sessionTtlMs: optionalInt('SESSION_TTL_MS', 30 * 60 * 1000),
  searchCooldownMs: optionalInt('SEARCH_COOLDOWN_MS', 30 * 1000),

  // Parsers
  maxParserPages: optionalInt('MAX_PARSER_PAGES', 3),
  requestTimeoutMs: optionalInt('REQUEST_TIMEOUT_MS', 15000),
  pageDelayMs: optionalInt('PAGE_DELAY_MS', 1000),

  // UI
  resultsPerPage: optionalInt('RESULTS_PER_PAGE', 5),
  favoritesPerPage: optionalInt('FAVORITES_PER_PAGE', 5),

  // Scheduler
  digestCron: process.env['DIGEST_CRON'] ?? '0 8 * * *',
  digestTimezone: process.env['DIGEST_TIMEZONE'] ?? 'Europe/Belgrade',

  // Data retention
  priceHistoryRetentionDays: optionalInt('PRICE_HISTORY_RETENTION_DAYS', 90),
} as const
