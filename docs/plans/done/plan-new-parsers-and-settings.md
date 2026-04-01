# Plan: New Parsers & Site Settings

**Date:** 2026-03-30
**Status:** Completed (Phases 1-2 done, Phase 3 moved to draft)

## Goal

Add kupujemprodajem.com parser (with optional login), a `/settings` command to enable/disable sites per user, and lay groundwork for future parsers (4zida.rs, oglasi.rs).

## Current State

- Two parsers: halooglasi (cheerio), nekretnine (cheerio)
- `ParserRegistry` fans out searches to all registered parsers — no per-user filtering
- No user settings table in DB
- No login/credential storage for any site

## Research Summary

### kupujemprodajem.com (KP)

- **Login for search: NOT required** — listings are publicly accessible
- **Login useful for:** messaging sellers, viewing full contact info, avoiding potential anonymous rate limits
- **Auth mechanism:** cookie-based sessions; supports email/password + social (Google, Facebook, Apple)
- **Undocumented API:** `/api/web/v1/search/ads`, `/api/web/v1/attributes/...` — used by the Next.js frontend
- **HTML scraping:** SSR via Next.js — cheerio-compatible
- **URL structure:** `/nekretnine-prodaja/kuce/pretraga?categoryId=2821&groupId=2823`
- **Listing detail:** `/nekretnine-prodaja/kuce/{slug}/oglas/{id}` — has JSON-LD schema
- **Data fields:** price (EUR), price/m², size, rooms, location (city/municipality/area), images (gallery), amenities, seller info
- **External ID:** numeric, from URL path (e.g. `190568401`)
- **Price format:** `195.000 €` (dot as thousands separator)
- **Pagination:** path-based `/grupa/2821/2823/{page}`
- **Anti-scraping:** robots.txt blocks `/api/` but allows HTML pages; no CAPTCHA on search; blocks AI bots by User-Agent
- **Third-party libraries exist:** Python, PHP, .NET — confirms scrapability

### Other promising sites (future)

| Site                  | Listings   | Login | Scraping               | Notes                                       |
| --------------------- | ---------- | ----- | ---------------------- | ------------------------------------------- |
| **4zida.rs**          | 99K+       | No    | Cheerio                | Largest property DB in Serbia, pricing data |
| **oglasi.rs**         | High       | No    | Cheerio                | Major classifieds portal, broad categories  |
| **realitica.com**     | #1 traffic | No    | Needs headless browser | Most visited but JS-heavy                   |
| **nekretnine365.com** | 99K+       | No    | Cheerio + XML feeds    | XML agency integration                      |
| **estitor.com**       | 75K+       | No    | Cheerio                | Commission-free model                       |

**Recommendation:** Add 4zida.rs as the next parser after KP — highest listing volume, cheerio-compatible, no login needed.

## Proposed Approach

### Phase 1: Site Settings (DB + bot command)

**1.1 — Database: `user_settings` table**

New table for per-user settings, starting with site toggles:

```sql
CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, key)
);
```

Generic key-value design. Site toggle keys: `site_halooglasi`, `site_nekretnine`, `site_kupujemprodajem`, etc. Values: `'1'` (enabled) or `'0'` (disabled). Default: all sites enabled (absence of key = enabled).

New queries file `src/db/queries/user-settings.ts`:

- `getSetting(userId, key): string | null`
- `setSetting(userId, key, value): void`
- `getEnabledSites(userId): string[]` — returns list of enabled source names
- `getAllSettings(userId): Record<string, string>` — for settings display

**1.2 — Bot: `/settings` command**

Flow:

```
/settings
  -> [Message: ⚙️ Настройки]
     [Keyboard:]
       🌐 Источники поиска
     -> User taps "🌐 Источники поиска"
        -> [editMessageText: site list with toggles]
           ✅ Halooglasi
           ✅ Nekretnine.rs
           ✅ KupujemProdajem
           [« Назад к настройкам]
        -> User taps a site
           -> Toggle on/off, redraw keyboard
           -> answerCbQuery: "Включено" / "Отключено"
        -> User taps "« Назад к настройкам"
           -> Back to settings menu
```

Callback data: `set_sites` (open site list), `set_site_{source}` (toggle), `set_back` (back to menu)

Toggle display uses same `✅`/`◻️` pattern as search profile selection (from UX fixes plan).

Files: `src/bot/commands/settings.ts` (new), `src/bot/messages.ts`

**1.3 — ParserRegistry: per-user site filtering**

Currently `searchAll` and `searchCombined` search all registered parsers. Need to filter by user's enabled sites.

Approach: add `enabledSources?: string[]` parameter to `searchAll` and `searchCombined`:

```typescript
async searchAll(params: SearchParams, enabledSources?: string[]): Promise<Listing[]> {
  const parsers = enabledSources
    ? this.parsers.filter(p => enabledSources.includes(p.source))
    : this.parsers
  // ... rest unchanged
}
```

Callers (`search.ts`, `digest.ts`) look up user's enabled sites and pass them in.

Files: `src/parsers/registry.ts`, `src/bot/commands/search.ts`, `src/scheduler/digest.ts`

### Phase 2: KupujemProdajem parser

**2.1 — Parser: `kupujemprodajem.ts`**

Follows same pattern as halooglasi/nekretnine parsers.

**URL building:**

- Base: `https://www.kupujemprodajem.com/nekretnine-prodaja/kuce/pretraga`
- Query params: `categoryId=2821`, `groupId=2823`
- Keywords: `data[keywords]={keywords}` (or similar — needs verification during implementation)
- Location: likely `data[location_id]` or text-based search
- Price range, size: need to discover param names from the frontend form

Fallback approach: if query params are not sufficient, use the HTML form's hidden fields or the `/api/web/v1/` endpoints.

**HTML parsing selectors** (need verification, based on research):

- Listing cards: container elements with listing links
- External ID: numeric from URL path `/oglas/{id}`
- Price: text matching `X.XXX €` pattern
- Size: from listing metadata
- Location: breadcrumb pattern `City | Municipality | Area`
- Image: gallery thumbnails

**JSON-LD fallback:** Detail pages have structured `schema.org` JSON-LD with price, address, floorSize, numberOfRooms — can be used as enrichment source.

```typescript
export class KupujemProdajemParser implements Parser {
  readonly source = 'kupujemprodajem'

  async search(params: SearchParams): Promise<Listing[]> {
    // Same pattern: build URL, fetch pages, parse HTML, return listings
  }
}
```

**Important differences from other parsers:**

- Price format uses dot as thousands separator AND `€` suffix: `195.000 €`
- Price per m² available (bonus data, not in Listing interface currently)
- External IDs are purely numeric (short, no callback_data risk)
- Site blocks AI User-Agents — must use browser-like UA (already the pattern)

Files: `src/parsers/kupujemprodajem.ts`, `src/parsers/kupujemprodajem.test.ts`

**2.2 — Register parser**

Add to entry point where parsers are registered:

```typescript
import { KupujemProdajemParser } from './parsers/kupujemprodajem'
registry.register(new KupujemProdajemParser())
```

Files: `src/index.ts`

### Phase 3: Future parsers

Moved to dedicated plan: `docs/plans/plan-4zida-oglasi-parsers.md`

## Technical Decisions

| Decision             | Choice                                     | Rationale                                                                                   |
| -------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Settings storage     | Generic key-value `user_settings` table    | Flexible for site toggles, KP sessions, future preferences without schema changes           |
| KP search method     | HTML scraping (cheerio)                    | SSR via Next.js, same stack as other parsers, avoids `/api/` which is blocked by robots.txt |
| KP login             | Deferred to draft                          | Not needed for core functionality; anonymous search works fine                              |
| Site filtering       | `enabledSources` param in registry methods | Minimal change to existing architecture; per-user filtering at the caller level             |
| Next parser after KP | 4zida.rs                                   | Highest listing volume (99K+), cheerio-compatible, no login, fills coverage gap             |

## File Structure

```
src/
  parsers/
    kupujemprodajem.ts          — NEW: KP parser (cheerio)
    kupujemprodajem.test.ts     — NEW: KP parser tests
    types.ts                    — Parser interface (unchanged)
    registry.ts                 — add enabledSources filtering
  bot/
    commands/
      settings.ts               — NEW: /settings command + site toggles + KP login
    messages.ts                 — add settings/login messages
  db/
    database.ts                 — add user_settings table migration
    queries/
      user-settings.ts          — NEW: settings CRUD
  index.ts                      — register KP parser
```

## Risks & Open Questions

- **Risk:** KP may block scraping via rate limiting or IP bans — **Mitigation:** 1s delay between pages (same as other parsers), realistic User-Agent, max 3 pages
- **Risk:** KP HTML structure may differ from research findings — **Mitigation:** implementation phase includes HTML exploration + tests with fixture HTML
- **Question:** KP search URL query params need verification during implementation — the research identified the structure but exact param names may differ

## Acceptance Criteria

- [x] `/settings` command shows settings menu with site toggles
- [x] Users can enable/disable each site (halooglasi, nekretnine, kupujemprodajem)
- [x] Disabled sites are skipped during search and digest
- [x] `user_settings` table created via migration
- [x] KP parser returns listings matching the `Listing` interface
- [x] KP parser handles pagination (up to 3 pages)
- [x] KP parser has unit tests with HTML fixtures
- [x] KP parser registered and included in search results
- [ ] ~~KP login~~ — moved to `docs/plans/draft/idea-kp-login.md`
- [x] Site toggles use `✅`/`◻️` consistent with UX patterns
- [x] All settings messages in Russian
