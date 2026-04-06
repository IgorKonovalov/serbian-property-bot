import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { createLogger } from '../logger'

const logger = createLogger('db')

let db: Database.Database | null = null

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  telegram_id INTEGER UNIQUE NOT NULL,
  username TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS search_profiles (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  keywords TEXT NOT NULL,
  min_price INTEGER,
  max_price INTEGER,
  min_size INTEGER,
  max_size INTEGER,
  min_plot_size INTEGER,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY,
  external_id TEXT NOT NULL,
  source TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  price INTEGER,
  size INTEGER,
  plot_size INTEGER,
  rooms INTEGER,
  area TEXT,
  city TEXT,
  image_url TEXT,
  first_seen_at TEXT DEFAULT (datetime('now')),
  last_seen_at TEXT DEFAULT (datetime('now')),
  UNIQUE(source, external_id)
);

CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  price INTEGER NOT NULL,
  recorded_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  added_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, key)
);
`

export function initDatabase(dbPath: string): Database.Database {
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)

  // Migration: add image_url column if missing (for existing databases)
  const columns = db.prepare("PRAGMA table_info('listings')").all() as {
    name: string
  }[]
  if (!columns.some((c) => c.name === 'image_url')) {
    db.exec('ALTER TABLE listings ADD COLUMN image_url TEXT')
  }

  // Migration: drop unused raw_data column
  if (columns.some((c) => c.name === 'raw_data')) {
    db.exec('ALTER TABLE listings DROP COLUMN raw_data')
  }

  // Migration: add indexes for price_history and favorites
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_price_history_listing
      ON price_history(listing_id, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_favorites_user
      ON favorites(user_id);
  `)

  // Data retention: remove old price history entries
  const retentionDays =
    parseInt(process.env['PRICE_HISTORY_RETENTION_DAYS'] ?? '', 10) || 90
  const deleted = db
    .prepare(
      `DELETE FROM price_history WHERE recorded_at < datetime('now', '-' || ? || ' days')`
    )
    .run(retentionDays)
  if (deleted.changes > 0) {
    logger.info('Price history cleanup', {
      deletedRows: deleted.changes,
      retentionDays,
    })
  }

  return db
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase first.')
  return db
}
