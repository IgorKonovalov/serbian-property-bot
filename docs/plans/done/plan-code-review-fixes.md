# Plan: Code Review — Security, Bugs & Best Practices

**Date:** 2026-03-30
**Status:** Completed

## Goal

Address security risks, bugs, and code quality issues discovered during a full codebase review to improve robustness, safety, and maintainability.

## Review Summary

| Category     | Critical | High | Medium | Low |
| ------------ | -------- | ---- | ------ | --- |
| Security     | 1        | 1    | 3      | 1   |
| Bugs         | —        | 2    | 2      | 1   |
| Code quality | —        | —    | 4      | 2   |

---

## Findings

### SECURITY

#### S1 — CRITICAL: Bot token exposed in `.env` (already committed or not)

- `.env` is gitignored, but the token `8673118253:AAG5oj8l...` is visible in the working directory and was readable by tooling.
- **Risk:** If `.env` was ever committed, the token is in git history. Even if not, any process on the machine can read it.
- **Action:** Rotate the token via @BotFather. Verify `.env` was never committed (`git log --all -- .env`). Add a safety check in CI/pre-commit.

#### S2 — HIGH: No input length validation on user text

- Files: `search.ts:209` (area), `profiles.ts:273-290` (name, keywords, filters)
- User can send arbitrarily long strings (Telegram allows 4096 chars per message). These go straight to the database and to URL query params.
- **Risk:** Oversized URL → HTTP 414; oversized DB fields → bloated storage; used in HTML messages → Telegram API rejects (4096 char limit).
- **Action:** Cap `name` at 100 chars, `keywords` at 200 chars, `area` at 100 chars. Reject with user-friendly message.

#### S3 — MEDIUM: URLs not escaped in HTML `<a href="">` tags

- Files: `messages.ts` (resultCard, detailCaption), `digest.ts:26,39`
- URLs from parsed sites are embedded directly in `href="..."`. A URL containing `"` could break HTML or inject attributes.
- **Risk:** Low today (URLs come from known sites), but a parser bug or new source could introduce issues.
- **Action:** Escape `"` and `&` in URLs before embedding in `href`.

#### S4 — MEDIUM: No HTTP response status validation in parsers

- Files: `halooglasi.ts:132`, `nekretnine.ts` (similar)
- `axios.get()` throws on 4xx/5xx by default, but there's no handling for 429 (rate limit), 503 (maintenance), or redirect chains.
- **Action:** Add explicit status checks. On 429, respect `Retry-After`. Log non-200 responses.

#### S5 — MEDIUM: No rate limiting on bot commands

- Any user can trigger `/search` rapidly, causing multiple concurrent scrapes (up to 6 HTTP requests each).
- **Risk:** IP gets blocked by target sites; excessive CPU/memory usage.
- **Action:** Add per-user command cooldown (e.g., 30s between `/search` invocations).

#### S6 — LOW: `raw_data` column unused but present in schema

- `database.ts:43` — column exists but is never populated.
- **Risk:** Future use could accidentally store sensitive scraped HTML.
- **Action:** Remove the column in a migration or document its intended purpose.

---

### BUGS

#### B1 — HIGH: In-memory state maps grow unboundedly (memory leak)

- Files: `search.ts:29` (`userStates`), `profiles.ts:27` (`userStates`), `digest.ts` (digest command caches)
- States are created on each command but only deleted on success/error of the immediate flow. If a user starts `/search`, gets to `entering_area`, then never types — state lives forever.
- **Impact:** On a long-running bot, memory grows proportional to unique users × abandoned sessions.
- **Action:** Implement a TTL-based cleanup. Run `setInterval` every 5 minutes to evict entries older than 30 minutes. Add `createdAt` timestamp to state objects.

#### B2 — HIGH: `refreshFavoritePrices` doesn't actually refresh favorite prices

- File: `digest.ts:171-203`
- It fetches search results based on user profiles and upserts them, but this only catches price changes for listings that happen to match current search queries. Favorites added from different searches or with changed profiles are never refreshed.
- **Impact:** Users miss price changes on favorites that no longer match their active profiles.
- **Action:** Fetch each favorited listing directly by URL (one request per listing) instead of re-running full profile searches.

#### B3 — MEDIUM: Profile text handler conflicts with search text handler

- Both `search.ts:201` and `profiles.ts:268` register `bot.on('text')` handlers. Ordering depends on registration order in `bot.ts`.
- If both `searchState` and `profileState` exist for the same user, the first-registered handler wins.
- **Impact:** User in profile edit mode might accidentally trigger search area input, or vice versa.
- **Action:** Check for conflicting state in both handlers. If profile state exists, skip search handler (and vice versa). Or unify into a single text dispatcher.

#### B4 — MEDIUM: `upsertListing` return value is incorrect after UPDATE

- File: `listings.ts:55` — `{ ...existing, ...listing, id: existing.id } as unknown as DbListing`
- Spreads `Listing` (camelCase) fields over `DbListing` (snake_case) fields, producing a hybrid object with both `imageUrl` and `image_url`.
- **Impact:** Downstream code using the return value may read stale data from `existing` or wrong field names.
- **Action:** Re-fetch from DB after update (same as the INSERT path), or map fields explicitly.

#### B5 — LOW: `buildDigestForUser` is dead code

- File: `digest.ts:133-141` — marked "Legacy function for backward compatibility" but nothing calls it.
- **Action:** Delete it.

---

### CODE QUALITY

#### Q1 — MEDIUM: Duplicate logic across parsers

- `HalooglasiParser.search()` and `NekretnineParser.search()` share identical structure: page loop, axios call, delay, hasNextPage check.
- Both use the same `USER_AGENT`, same `timeout: 15000`, same `maxPages = 3`, same `1000ms` delay.
- **Action:** Extract a `BaseParser` abstract class or a shared `paginatedSearch(buildUrl, parsePage, hasNextPage)` helper.

#### Q2 — MEDIUM: Magic numbers scattered

- `RESULTS_PER_PAGE = 5` (search.ts), `FAVORITES_PER_PAGE = 5` (favorites.ts), `maxPages = 3` (parsers), `timeout: 15000`, `1000ms` delay, `hoursAgo: 24` (digest), top `10` new listings.
- **Action:** Consolidate into `src/config.ts` or a `constants.ts` file.

#### Q3 — MEDIUM: `type` assertions (`as unknown as`) instead of proper mapping

- `listings.ts:55`, `listings.ts:86`, `search-profiles.ts` — multiple `as` casts between DB rows and typed interfaces.
- **Action:** Create explicit mapper functions `dbRowToListing()`, `dbRowToProfile()` etc.

#### Q4 — MEDIUM: No structured logging

- All logging is `console.log`/`console.error` with ad-hoc messages.
- **Action:** Not urgent for a single-user bot, but would help debugging. Consider a simple logger with timestamps and levels (e.g., `pino` or a thin wrapper).

#### Q5 — LOW: Inconsistent string construction in `messages.ts`

- Mix of template literals and `+` concatenation.
- **Action:** Standardize on template literals. Low priority.

#### Q6 — LOW: Missing database indexes

- `price_history.listing_id` and `favorites.user_id` are queried frequently but not indexed.
- `getPriceChangesForUser` does multiple subqueries on `price_history` — performance degrades with data growth.
- **Action:** Add indexes: `CREATE INDEX idx_price_history_listing ON price_history(listing_id, recorded_at)` and `CREATE INDEX idx_favorites_user ON favorites(user_id)`.

---

## Proposed Approach

### Phase 1: Security fixes (Critical + High)

- [ ] Rotate bot token via @BotFather, update `.env` _(manual, owner action)_
- [ ] Verify `.env` never committed: `git log --all -- .env` _(manual, owner action)_
- [x] Add input length validation in `search.ts` and `profiles.ts` (area ≤100, name ≤100, keywords ≤200)
- [x] Add user-friendly rejection messages to `messages.ts`

### Phase 2: Bug fixes

- [x] Add `createdAt` to state interfaces, implement TTL cleanup (30 min expiry, 5 min sweep interval) for `userStates` in `search.ts` and `profiles.ts`
- [x] Fix `upsertListing` to re-fetch from DB after UPDATE (consistent with INSERT path)
- [x] Add guard in text handlers: skip if other command's state exists for this user
- [x] Delete dead `buildDigestForUser` function
- [ ] Fix `refreshFavoritePrices` to actually re-scrape favorited listings by URL _(deferred — requires parser changes for single-listing fetch)_

### Phase 3: Security hardening (Medium)

- [x] Escape `"` in URLs before embedding in HTML `href` attributes — add `escapeUrl()` to `utils.ts`
- [x] Add per-user command cooldown for `/search` (30s) — simple `Map<number, number>` with timestamp check
- [ ] Add HTTP status handling in parsers: log non-200, handle 429 with backoff _(deferred — low risk for current site set)_
- [x] Remove unused `raw_data` column (add migration)

### Phase 4: Code quality improvements

- [ ] Extract shared pagination logic into `BaseParser` or `paginatedSearch()` helper _(deferred)_
- [ ] Move magic numbers to `src/constants.ts` _(deferred)_
- [x] Add database indexes for `price_history` and `favorites`
- [ ] Replace `as unknown as` casts with explicit mapper functions _(deferred)_
- [ ] Standardize `messages.ts` string construction to template literals _(deferred)_

---

## Technical Decisions

| Decision         | Choice                      | Rationale                                                                            |
| ---------------- | --------------------------- | ------------------------------------------------------------------------------------ |
| State cleanup    | TTL with sweep interval     | Simpler than per-state timers; low overhead for small user base                      |
| Input validation | Hard character limits       | Simpler than regex validation; prevents all oversized input issues                   |
| Rate limiting    | In-memory timestamp map     | No new dependencies; sufficient for single-instance bot                              |
| Parser dedup     | `BaseParser` abstract class | Both parsers share identical control flow; only URL building and HTML parsing differ |
| Logging          | Defer to Phase 4+           | Not blocking; current `console.*` is adequate for single-user bot                    |

## Risks & Open Questions

- **Risk:** Rotating bot token breaks running bot instance — **Mitigation:** coordinate token rotation with bot restart
- **Risk:** `refreshFavoritePrices` rewrite requires fetching individual listing pages (different HTML structure than search pages) — **Mitigation:** as interim fix, document the limitation and expand profile-based search to cover more listings
- **Question:** Should `raw_data` column be kept for future debugging/auditing purposes? — Decide before Phase 3

## Acceptance Criteria

- [ ] Bot token rotated, `.env` confirmed never in git history _(manual, owner action)_
- [x] User input exceeding limits is rejected with clear message
- [x] In-memory state maps are cleaned up after 30 minutes of inactivity
- [x] `upsertListing` returns correct, consistent data after both INSERT and UPDATE
- [x] No text handler conflicts between search and profiles
- [x] All existing tests pass
- [x] No new lint/type errors
