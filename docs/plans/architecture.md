# Plan: Bot Architecture

**Date:** 2026-03-30
**Status:** Draft

## Goal

Define the full architecture for property-bot: modules, data flow, DB schema, bot commands, and implementation phases.

## Current State

- Stub `src/index.ts` with dotenv import
- Dependencies: telegraf, puppeteer (to be replaced), dotenv
- ADR-001 accepted: axios+cheerio, Playwright fallback, SQLite, node-cron, Fly.io
- No bot commands, parsers, or database yet

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                   Telegram User                  │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│                 Telegraf Bot                      │
│  /start  /search  /profiles  /favorites  /digest  │
│  Inline keyboard navigation                      │
└──────┬───────────────┬──────────────────────────┘
       │               │
┌──────▼──────┐ ┌──────▼──────┐
│  Search     │ │  Scheduler  │
│  Service    │ │  (node-cron)│
│  (on-demand)│ │  08:00 CET  │
└──────┬──────┘ └──────┬──────┘
       │               │
┌──────▼───────────────▼──────┐
│        Parser Registry       │
│  halooglasi  │  nekretnine   │
│  (cheerio)   │  (cheerio)    │
│  kupujempr*  │  future sites │
└──────────────┬──────────────┘
               │
┌──────────────▼──────────────┐
│     SQLite (better-sqlite3)  │
│  listings │ price_history    │
│  favorites│ search_profiles  │
│  users    │                  │
└─────────────────────────────┘
```

## Bot Commands & UX

### /start

- Register user, show welcome message with available commands

### /search

- User has multiple **search profiles** — named saved queries
- Each profile has: name, keywords, optional numeric filters (price, size, plot)
- Profiles can be **combined** — run multiple profiles in one search, results merged and deduplicated
- Examples of profiles:
  - "Banatska kuća" — keyword search
  - "Gospodska kuća" — keyword search
  - "Salonska kuća" — keyword search
  - "Porodična kuća >17 ari" — keyword + plot size filter
  - "Visina plafona >3m" — keyword + custom attribute
- Flow:
  1. `/search` — shows list of saved profiles as **multi-select** inline buttons (toggle on/off)
  2. Each profile button shows ✓/✗ to indicate selection state
  3. User selects one or more profiles, then presses [Search]
  4. Bot asks for area (free text)
  5. Bot runs all selected profiles in parallel across all sites, merges and deduplicates results
- Example: selecting "Banatska kuća" + "Gospodska kuća" + "Salonska kuća" gives a broad search across all traditional house types

### /profiles

- List all saved search profiles
- Inline buttons: [Run] [Edit] [Delete] for each
- [+ Add profile] button at the bottom
- Adding/editing a profile: bot asks for name, keywords, optional filters (price range, min plot size, min size) as free text
- Profiles are per-user and persist in DB

### /favorites

- List user's favorited listings
- Each listing shows: title, price, size, area, source site, link
- Inline button to remove from favorites

### /digest

- On-demand: show today's price changes and new listings matching config
- Same format as the morning digest

### Search Results UX

- Results merged from all sites, sorted by price (ascending)
- Each result shows:
  ```
  🏠 2-room, 54m² — €52,000
  📍 Novi Sad, Liman
  🔗 halooglasi.com
  [View] [⭐ Save]
  ```
- `[View]` — inline button, opens listing URL in browser
- `[⭐ Save]` — inline button, adds to favorites
- Paginated: 5 results per page, `[← Prev] [Next →]` buttons
- Total count shown: "Showing 1-5 of 23 results"

### Morning Digest (08:00 CET)

- Sent to all users automatically
- Sections:
  1. **Price changes** on favorited listings (old price → new price, with % change)
  2. **New listings** matching user's active search profiles (top 10 per profile)
- If nothing to report: no message sent (don't spam)

## Database Schema

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  telegram_id INTEGER UNIQUE NOT NULL,
  username TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE search_profiles (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,                      -- display name, e.g. "Banatska kuća"
  keywords TEXT NOT NULL,                  -- search query sent to sites
  min_price INTEGER,                       -- optional EUR
  max_price INTEGER,
  min_size INTEGER,                        -- optional m²
  max_size INTEGER,
  min_plot_size INTEGER,                   -- optional ares (for houses with land)
  is_active INTEGER DEFAULT 1,            -- included in daily digest?
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE listings (
  id INTEGER PRIMARY KEY,
  external_id TEXT NOT NULL,               -- site-specific ID
  source TEXT NOT NULL,                    -- 'halooglasi' | 'nekretnine'
  url TEXT NOT NULL,
  title TEXT,
  price INTEGER,                           -- in EUR
  size INTEGER,                            -- m²
  plot_size INTEGER,                       -- ares (for houses)
  rooms INTEGER,
  area TEXT,                               -- neighborhood/city
  city TEXT,
  raw_data TEXT,                           -- full scraped JSON for debugging
  first_seen_at TEXT DEFAULT (datetime('now')),
  last_seen_at TEXT DEFAULT (datetime('now')),
  UNIQUE(source, external_id)
);

CREATE TABLE price_history (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  price INTEGER NOT NULL,
  recorded_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE favorites (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  added_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, listing_id)
);
```

## Parser Interface

Every site parser implements the same interface:

```typescript
interface Listing {
  externalId: string
  source: string
  url: string
  title: string
  price: number | null // EUR
  size: number | null // m²
  rooms: number | null
  area: string | null
  city: string | null
}

interface SearchParams {
  keywords: string // e.g. "Banatska kuća"
  area: string // e.g. "Novi Sad"
  minPrice?: number // EUR
  maxPrice?: number
  minSize?: number // m²
  maxSize?: number
  minPlotSize?: number // ares
}

interface Parser {
  readonly source: string
  search(params: SearchParams): Promise<Listing[]>
}
```

Parser registry loads all parsers and fans out searches:

```typescript
class ParserRegistry {
  private parsers: Parser[] = []

  register(parser: Parser): void
  async searchAll(params: SearchParams): Promise<Listing[]> // single profile across all sites
  async searchCombined(paramsList: SearchParams[]): Promise<Listing[]> // multiple profiles, merge + dedupe + sort by price
}
```

## File Structure

```
src/
  index.ts                    — entry point: init bot, DB, cron
  bot/
    bot.ts                    — Telegraf instance, middleware setup
    commands/
      start.ts                — /start handler
      search.ts               — /search handler + result pagination
      profiles.ts             — /profiles handler + CRUD for search profiles
      favorites.ts            — /favorites handler
      digest.ts               — /digest handler
    keyboards/
      search-results.ts       — result card with View/Save buttons
      pagination.ts           — prev/next navigation
      profiles.ts             — profile list and selection keyboards
  parsers/
    types.ts                  — Listing, SearchParams, Parser interfaces
    registry.ts               — ParserRegistry
    halooglasi.ts             — halooglasi.com parser
    nekretnine.ts             — nekretnine.rs parser
  db/
    database.ts               — SQLite init, migrations
    queries/
      users.ts                — user CRUD
      listings.ts             — listing upsert, search, price diff
      favorites.ts            — favorite add/remove/list
      search-profiles.ts      — profile CRUD
  scheduler/
    cron.ts                   — node-cron setup, daily scrape job
    digest.ts                 — build and send digest messages
  config.ts                   — env vars, defaults
```

## Implementation Phases

### Phase 1: Foundation

- [x] Set up SQLite database with schema and migrations
- [x] Define TypeScript interfaces (Listing, SearchParams, Parser)
- [x] Create parser registry
- [x] Initialize Telegraf bot with /start command
- [x] Wire up entry point: bot + DB init

### Phase 2: First Parser (halooglasi)

- [ ] Implement halooglasi parser with cheerio
- [ ] Map search params to halooglasi URL query parameters
- [ ] Parse listing cards from HTML
- [ ] Store results in DB with upsert logic

### Phase 3: Search & Results UX

- [ ] Implement /search command — profile selection via inline buttons, then area input
- [ ] Seed default profiles for new users (from user's list)
- [ ] Merge results from registry, sort by price
- [ ] Result cards with View/Save inline buttons
- [ ] Pagination (5 per page)

### Phase 4: Profiles & Favorites

- [ ] Implement /profiles — list, add, edit, delete search profiles
- [ ] Profile CRUD with inline keyboards
- [ ] Implement /favorites — list, remove
- [ ] Save button on search results adds to favorites

### Phase 5: Second Parser (nekretnine)

- [ ] Implement nekretnine.rs parser
- [ ] Register in parser registry — search results now merge both sites

### Phase 6: Scheduler & Digest

- [ ] node-cron job at 08:00 CET: scrape all sites for each user's config
- [ ] Price change detection: compare new prices to last known
- [ ] Record price history
- [ ] Build digest message: price changes + new matches
- [ ] Send digest to each user (skip if nothing to report)
- [ ] Implement /digest for on-demand digest

### Phase 7: Deployment

- [ ] Dockerfile
- [ ] Deploy to Fly.io (fly.toml + persistent volume) or Serbian VPS
- [ ] Environment variable setup
- [ ] Verify scraping works from hosting IP (test geo-blocking)
- [ ] If geo-blocked: migrate to Serbian VPS (~$3-5/month) for native Serbian IP

## Technical Decisions

| Decision                          | Choice                                | Rationale                                                                                                                |
| --------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Multiple search profiles per user | Keyword-based saved queries           | User searches for specific property types (Banatska kuća, Gospodska kuća, etc.) — not generic structured filters         |
| Combinable profiles               | Multi-select in /search               | User can run broad searches by combining e.g. all traditional house types. Results deduplicated by (source, external_id) |
| Prices normalized to EUR          | integer                               | All prices stored/displayed in EUR; convert RSD if encountered                                                           |
| Area as free text                 | Not enum                              | Too many neighborhoods to enumerate; let sites handle matching                                                           |
| Pagination size                   | 5 results                             | Telegram messages get unwieldy with more; keeps scrolling manageable                                                     |
| Minimal conversation              | Stateless commands + inline keyboards | Only area and profile editing need free text; everything else is buttons                                                 |
| Digest skip when empty            | No message if no changes              | Don't train users to ignore the bot                                                                                      |

## Risks & Open Questions

- **Risk:** Site HTML structure changes break parsers — **Mitigation:** Each parser is isolated; breakage is contained. Add basic health checks to detect when a parser returns 0 results unexpectedly.
- **Risk:** Sites may rate-limit or block scraping — **Mitigation:** Respect robots.txt, add delays between requests, use realistic User-Agent. For 5 users + 1 daily scrape, request volume is very low.
- **Risk:** Free text area input may not match site's area taxonomy — **Mitigation:** Pass area string directly to site search; let the site handle fuzzy matching. Show "no results" if nothing found.
- **Decided:** Normalize all prices to EUR. If a site lists in RSD, convert at scrape time.

## Acceptance Criteria

- [ ] Bot responds to /start, /search, /profiles, /favorites, /digest
- [ ] Search profiles support keyword queries with optional price/size/plot filters
- [ ] Search returns merged, sorted results from halooglasi + nekretnine
- [ ] Results show inline buttons for View (opens link) and Save (adds favorite)
- [ ] Search results paginate with 5 per page
- [ ] User can manage search profiles via /profiles (add, edit, delete)
- [ ] Favorites persist across sessions
- [ ] Price changes are tracked in price_history
- [ ] Daily digest sent at 08:00 CET with price changes + new matches
- [ ] /digest returns the same info on demand
- [ ] Bot deployed on Fly.io, accessible 24/7
