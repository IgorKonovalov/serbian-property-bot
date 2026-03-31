# Plan: New Parsers & Site Settings

**Date:** 2026-03-30
**Status:** In Progress (Phases 1-2 complete)

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

### Phase 3: KP login (optional auth)

**3.1 — Why login?**

Login is NOT required for searching, but provides:

- Access to seller contact info
- Ability to message sellers directly
- Potentially higher rate limits / less blocking
- Access to user's KP favorites and saved searches

**3.2 — Credential storage**

Store encrypted KP credentials per user in `user_settings`:

- Key: `kp_session` — stores session cookie(s) after successful login
- Do NOT store raw username/password — only session tokens
- Sessions expire — handle gracefully (fall back to anonymous search)

**3.3 — Login flow in bot**

Add KP login option to settings menu:

```
/settings
  -> ⚙️ Настройки
     🌐 Источники поиска
     🔑 Войти в KupujemProdajem
     -> User taps "🔑 Войти в KP"
        -> [Message: instructions]
           "Для входа в KupujemProdajem:
            1. Откройте ссылку ниже
            2. Войдите в аккаунт
            3. Скопируйте и отправьте мне cookie (инструкция ниже)"
           [🔗 Открыть KP] (URL button to login page)
```

**Alternative approach (simpler, recommended):**

Instead of asking users to copy cookies manually, implement a two-step flow:

1. Bot asks for KP email and password via text input (wizard-style, like profile creation)
2. Bot performs login via HTTP POST to KP's login endpoint
3. Bot stores resulting session cookies in DB
4. Bot confirms success/failure
5. Password is NOT stored — only the session cookie

```
/settings -> 🔑 Войти в KP
  -> [Message: "Введите email от KupujemProdajem:"]
     -> User types email
        -> [Message: "Введите пароль:"]
           -> User types password
              -> Bot attempts login via HTTP
              -> Success: "✅ Вход выполнен! Сессия сохранена."
              -> Failure: "❌ Не удалось войти. Проверьте данные."
     -> ✕ Отмена (cancel at any step)
```

**Login implementation:**

- POST to KP login endpoint with email/password
- Extract session cookies from response
- Store cookies in `user_settings` (key: `kp_session`, value: JSON cookie string)
- KP parser checks for stored session — if available, includes cookies in requests

**3.4 — Parser with optional auth**

Extend `KupujemProdajemParser` to accept optional session cookies:

```typescript
export class KupujemProdajemParser implements Parser {
  async search(params: SearchParams, cookies?: string): Promise<Listing[]> {
    const headers = { 'User-Agent': USER_AGENT, ... }
    if (cookies) {
      headers['Cookie'] = cookies
    }
    // ... same parsing logic
  }
}
```

Problem: the `Parser` interface's `search(params)` doesn't support extra args. Options:

**Option A:** Add optional `context` to `SearchParams`:

```typescript
interface SearchParams {
  // ... existing fields
  context?: Record<string, string> // site-specific extras (cookies, tokens)
}
```

**Option B:** Pass cookies via parser constructor or a setter:

```typescript
const kpParser = new KupujemProdajemParser()
kpParser.setSession(userId, cookies) // per-user session cache
registry.register(kpParser)
```

**Decision:** Option B — keeps the Parser interface clean. The parser maintains an internal `Map<userId, string>` for sessions. Before search, the caller sets the session if available. If no session, searches anonymously.

But this requires passing `userId` through the search flow. Currently `searchAll`/`searchCombined` don't know about users.

**Revised approach:** Add optional `userId` to `searchAll`/`searchCombined` (already being modified for site filtering in Phase 1). Parsers that need auth can look up credentials themselves:

```typescript
interface Parser {
  readonly source: string
  search(params: SearchParams): Promise<Listing[]>
  setUserContext?(userId: number): void // optional, for auth-aware parsers
}
```

Registry calls `parser.setUserContext(userId)` before `parser.search()` if the method exists. The KP parser uses this to load session cookies from DB.

Files: `src/parsers/types.ts`, `src/parsers/registry.ts`, `src/parsers/kupujemprodajem.ts`, `src/bot/commands/settings.ts`, `src/db/queries/user-settings.ts`

**3.5 — Session management**

- Sessions may expire — if a request returns a login redirect or 401, clear the stored session
- Show session status in settings: `🔑 KupujemProdajem: подключено ✅` or `🔑 KupujemProdajem: не подключено`
- Add a "Выйти" (logout) button to clear stored session
- Password message should be deleted after processing (bot deletes the user's message containing the password for security via `ctx.deleteMessage(ctx.message.message_id)`)

### Phase 4: Future parsers (not implemented now, just preparation)

**4.1 — 4zida.rs (recommended next)**

- 99K+ listings, cheerio-compatible, no login
- URL structure needs research during implementation
- Register as `source: '4zida'`
- Add to site settings toggles

**4.2 — oglasi.rs (after 4zida)**

- Major classifieds portal, broader than just property
- Cheerio-compatible, no login
- Register as `source: 'oglasi'`

No code for Phase 4 — just ensure the architecture supports easy addition (it already does via `ParserRegistry.register()`).

## Technical Decisions

| Decision                 | Choice                                                                  | Rationale                                                                                   |
| ------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Settings storage         | Generic key-value `user_settings` table                                 | Flexible for site toggles, KP sessions, future preferences without schema changes           |
| KP search method         | HTML scraping (cheerio)                                                 | SSR via Next.js, same stack as other parsers, avoids `/api/` which is blocked by robots.txt |
| KP login approach        | Bot collects email/password, performs HTTP login, stores session cookie | Simpler UX than asking user to copy cookies; password not stored                            |
| Auth in parser interface | Optional `setUserContext` method                                        | Keeps interface clean for parsers that don't need auth; no breaking changes                 |
| Site filtering           | `enabledSources` param in registry methods                              | Minimal change to existing architecture; per-user filtering at the caller level             |
| Next parser after KP     | 4zida.rs                                                                | Highest listing volume (99K+), cheerio-compatible, no login, fills coverage gap             |

## File Structure

```
src/
  parsers/
    kupujemprodajem.ts          — NEW: KP parser (cheerio)
    kupujemprodajem.test.ts     — NEW: KP parser tests
    types.ts                    — add setUserContext to Parser interface
    registry.ts                 — add enabledSources filtering + setUserContext call
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

- **Risk:** KP login endpoint may change or add CAPTCHA — **Mitigation:** login is optional; anonymous search always works as fallback
- **Risk:** KP may block scraping via rate limiting or IP bans — **Mitigation:** 1s delay between pages (same as other parsers), realistic User-Agent, max 3 pages
- **Risk:** KP HTML structure may differ from research findings — **Mitigation:** implementation phase includes HTML exploration + tests with fixture HTML
- **Risk:** Storing session cookies in plaintext DB — **Mitigation:** sessions are temporary tokens (not passwords), DB is local/server-only, sessions expire naturally. For extra security, could encrypt with a server-side key
- **Question:** Should KP login collect email/password in bot chat, or use a web-based OAuth flow? Bot chat is simpler but password is briefly visible in chat history. Bot deletes the password message immediately after reading.
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
- [ ] KP login flow collects credentials and stores session cookie
- [ ] KP login password message deleted from chat immediately
- [ ] Settings shows KP connection status (connected/not connected)
- [ ] KP parser uses session cookies when available, anonymous when not
- [ ] Expired KP sessions handled gracefully (fall back to anonymous)
- [x] Site toggles use `✅`/`◻️` consistent with UX patterns
- [x] All settings messages in Russian
