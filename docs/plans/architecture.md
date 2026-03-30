# Plan: Bot Architecture

**Date:** 2026-03-30
**Status:** In Progress (Phases 1-7 complete, Phase 8 pending)

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

- Register user, show welcome message in Russian with available commands

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
  1. `/poisk` — shows list of saved profiles as **multi-select** inline buttons (toggle on/off)
  2. Each profile button shows ✓/✗ to indicate selection state
  3. User selects one or more profiles, then presses [🔍 Искать]
  4. Bot asks: «Введите район/город» (free text)
  5. Bot runs all selected profiles in parallel across all sites, merges and deduplicates results
- Example: selecting "Banatska kuća" + "Gospodska kuća" + "Salonska kuća" gives a broad search across all traditional house types

### /profiles

- List all saved search profiles
- Inline buttons: [Запустить] [Изменить] [Удалить] for each
- [+ Добавить профиль] button at the bottom
- Adding/editing a profile: bot asks for name, keywords, optional filters in Russian
- Profiles are per-user and persist in DB

### /favorites

- List user's favorited listings
- Each listing shows: title, price, size, area, source site, link
- Inline button [Удалить] to remove from favorites

### /digest

- On-demand: show today's price changes and new listings matching config
- Same format as the morning digest

### Search Results UX

- Results merged from all sites, sorted by price (ascending)
- **List view** — compact text with clickable links, 5 results per page (HTML parse mode):
  ```
  1. 🏠 2 комн., 54м² — €52 000
     📍 Нови Сад, Лиман | <a href="https://...">halooglasi.com</a>
     [⭐ Сохранить]
  2. 🏠 3 комн., 78м² — €65 000
     📍 Нови Сад, Центар | <a href="https://...">nekretnine.rs</a>
     [⭐ Сохранить]
  ...
  [← Назад] [Далее →]
  Показано 1-5 из 23
  ```
- Site name is an inline URL link — tap to open listing directly from the list
- `[⭐ Сохранить]` inline button per listing to add to favorites
- `[← Назад] [Далее →]` for pagination
- Numbered inline buttons to open **detail view** with photo

- **Detail view** — when user taps a listing number, send `sendPhoto` with:
  ```
  [property photo]
  🏠 Banatska kuća, 3 комн., 78м²
  💰 €65 000
  📍 Нови Сад, Центар
  📐 Участок: 20 ари
  🔗 <a href="https://...">nekretnine.rs</a>
  [⭐ Сохранить] [← Назад к списку]
  ```
- Photo sent by URL — Telegram fetches and caches it, no download needed
- If no image available, fall back to text-only message

### Images

- Listing images are extracted during parsing as thumbnail URLs
- **halooglasi.com** — plain CDN URLs (`img.halooglasi.com`), direct access, no expiration
- **nekretnine.rs** — signed URLs with expiration params (`st=`, `ts=`, `e=`). Work if used soon after scraping; Telegram caches after first fetch so expiration doesn't matter
- Images are shown only in **detail view** (one photo per message via `sendPhoto`), not in list view (avoids rate limits and keeps list compact)
- `sendPhoto` supports caption (1024 chars) + inline keyboard — photo, details, and buttons in one message
- `sendMediaGroup` (albums) does NOT support inline keyboards, so gallery view is not used

### Morning Digest (08:00 CET)

- Sent to all users automatically, in Russian
- Sections:
  1. **Изменения цен** on favorited listings (старая цена → новая цена, with % change)
  2. **Новые объявления** matching user's active search profiles (top 10 per profile)
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
  image_url TEXT,                          -- thumbnail URL from source site
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
  imageUrl: string | null // thumbnail URL
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
    messages.ts               — all Russian UI strings (centralized)
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

- [x] Implement halooglasi parser with cheerio
- [x] Map search params to halooglasi URL query parameters
- [x] Parse listing cards from HTML
- [x] Store results in DB with upsert logic

### Phase 3: Search & Results UX

- [x] Implement /search command — profile selection via inline buttons, then area input
- [x] Seed default profiles for new users (from user's list)
- [x] Merge results from registry, sort by price
- [x] Result cards with View/Save inline buttons
- [x] Pagination (5 per page)

### Phase 4: Profiles & Favorites

- [x] Implement /profiles — list, add, edit, delete search profiles
- [x] Profile CRUD with inline keyboards
- [x] Implement /favorites — list, remove
- [x] Save button on search results adds to favorites

### Phase 5: Second Parser (nekretnine)

- [x] Implement nekretnine.rs parser
- [x] Register in parser registry — search results now merge both sites

### Phase 6: Scheduler & Digest

- [x] node-cron job at 08:00 CET: scrape all sites for each user's config
- [x] Price change detection: compare new prices to last known
- [x] Record price history
- [x] Build digest message: price changes + new matches
- [x] Send digest to each user (skip if nothing to report)
- [x] Implement /digest for on-demand digest

### Phase 7: Listing Images, Links & Digest Buttons

- [x] Add `imageUrl` to Listing interface and `image_url` to DB schema (migration)
- [x] Extract thumbnail URLs in halooglasi parser (plain CDN URLs)
- [x] Extract thumbnail URLs in nekretnine parser (signed URLs)
- [x] Add clickable inline URL links to list view (site name links to listing page, HTML parse mode)
- [x] Add numbered inline buttons to list view for opening detail view
- [x] Implement detail view: `sendPhoto` with image, caption with inline URL link, and buttons
- [x] Fallback to text-only detail if no image available
- [x] Add [← Назад к списку] button in detail view to return to list
- [x] Refactor digest to summary + category buttons:
  - Digest message becomes a compact summary with counts (e.g., "3 новых, 2 изменения цен")
  - Inline button `🆕 Новые (с DD.MM)` — shows "new since" date based on last digest/scrape timestamp
  - Inline button `📊 Цены (N изм.)` — shows count of price changes
  - Tapping a button sends a follow-up message with the detailed list for that category
  - Buttons only shown when the respective category has data (skip empty categories)
  - Works for both scheduled digest (`sendDigestToAll`) and on-demand `/digest` command

### Phase 8: Deployment

- [ ] Dockerfile (multi-stage build for small image)
- [ ] docker-compose.yml (property-bot service + SQLite volume)
- [ ] Environment variable setup (.env on VPS)
- [ ] Deploy to Serbian VPS (JEAP, PlusHosting, or MojServer ~€5-8/mo)
- [ ] Verify bot starts, scraping works, digest fires

## Technical Decisions

| Decision                          | Choice                                     | Rationale                                                                                                                |
| --------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Russian UI language               | All bot text, commands, buttons in Russian | Users are Russian-speaking; search keywords remain in Serbian (site queries)                                             |
| Multiple search profiles per user | Keyword-based saved queries                | User searches for specific property types (Banatska kuća, Gospodska kuća, etc.) — not generic structured filters         |
| Combinable profiles               | Multi-select in /search                    | User can run broad searches by combining e.g. all traditional house types. Results deduplicated by (source, external_id) |
| Prices normalized to EUR          | integer                                    | All prices stored/displayed in EUR; convert RSD if encountered                                                           |
| Area as free text                 | Not enum                                   | Too many neighborhoods to enumerate; let sites handle matching                                                           |
| Pagination size                   | 5 results                                  | Telegram messages get unwieldy with more; keeps scrolling manageable                                                     |
| Minimal conversation              | Stateless commands + inline keyboards      | Only area and profile editing need free text; everything else is buttons                                                 |
| Digest skip when empty            | No message if no changes                   | Don't train users to ignore the bot                                                                                      |

## Risks & Open Questions

- **Risk:** Site HTML structure changes break parsers — **Mitigation:** Each parser is isolated; breakage is contained. Add basic health checks to detect when a parser returns 0 results unexpectedly.
- **Risk:** Sites may rate-limit or block scraping — **Mitigation:** Respect robots.txt, add delays between requests, use realistic User-Agent. For 5 users + 1 daily scrape, request volume is very low.
- **Risk:** Free text area input may not match site's area taxonomy — **Mitigation:** Pass area string directly to site search; let the site handle fuzzy matching. Show "no results" if nothing found.
- **Decided:** Normalize all prices to EUR. If a site lists in RSD, convert at scrape time.

## Acceptance Criteria

- [ ] Bot responds to /start, /search, /profiles, /favorites, /digest
- [ ] All bot messages, buttons, and prompts are in Russian
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
