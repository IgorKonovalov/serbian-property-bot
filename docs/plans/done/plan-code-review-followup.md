# Plan: Code Review Follow-up — Deferred Items

**Date:** 2026-03-31
**Status:** Completed

## Goal

Address remaining items deferred from the original code review plan: parser resilience, shared parser logic, and minor code quality improvements.

## Current State

The original code review plan is complete. Security fixes (input validation, URL escaping, cooldown, raw_data removal) and bug fixes (TTL cleanup, handler conflicts, upsertListing) are all shipped. The `as unknown as` casts were already eliminated. What remains:

- Parsers have no HTTP error handling (429, 503, non-200)
- Three parsers duplicate identical pagination/fetch logic
- `refreshFavoritePrices` doesn't fetch favorites by URL — it re-runs profile searches
- A handful of magic numbers are scattered across files
- One `+` concatenation left in `messages.ts`

## Proposed Approach

### Phase 1: Parser resilience (S4)

Add HTTP status handling to all three parsers. Since all share the same axios+loop pattern, this naturally leads into Phase 2.

- [x] Check response status after `axios.get()` — skip page on non-200
- [x] On 429: log warning, stop pagination early (don't retry — keep it simple)
- [x] On 503/5xx: log warning, stop pagination early
- [x] Add `try/catch` around individual page fetches so one failed page doesn't abort the whole search

### Phase 2: Extract shared parser logic (Q1)

All three parsers (`halooglasi`, `nekretnine`, `kupujemprodajem`) share identical structure:

```
for page 1..maxPages:
  build URL for page
  axios.get(url, { headers, timeout: 15000 })
  parse HTML → listings
  if !hasNextPage: break
  delay 1000ms
```

Only three things differ: URL building, HTML parsing, and next-page detection.

- [x] Create `src/parsers/base-parser.ts` with a `paginatedSearch(config)` helper function
- [x] Move shared constants into the helper: `MAX_PAGES = 3`, `REQUEST_TIMEOUT = 15000`, `PAGE_DELAY = 1000`, `USER_AGENT`
- [x] Include the HTTP status handling from Phase 1 in the shared helper
- [x] Refactor all three parsers to use `paginatedSearch()`
- [x] Verify all parser tests still pass

### Phase 3: Fix refreshFavoritePrices (B2)

Current behavior: re-runs full profile searches, which only catches price changes for listings that happen to match active profiles. Favorites saved from different searches or with changed profiles are never refreshed.

- [x] `getListingById` already exists in `listings.ts`
- [x] In `refreshFavoritePrices`: for each user's favorites, fetch the listing URL directly using the appropriate parser
- [x] Add `fetchByUrl?(url: string): Promise<Listing | null>` optional method to `Parser` interface
- [x] Implement `fetchByUrl` in each parser — fetch the detail page, extract price
- [x] Registry: add `fetchByUrl(url: string, source: string)` that delegates to the right parser
- [x] Update `refreshFavoritePrices` to use registry's `fetchByUrl` for each favorite, upsert the result
- [x] Profile-based search remains in `buildDigestData` (catches new listings for digest)

### Phase 4: Minor cleanup (Q2, Q5)

Low priority, can be done opportunistically.

- [x] Parser magic numbers moved to `src/parsers/base-parser.ts` constants (covered by Phase 2)
- [ ] Move `RESULTS_PER_PAGE`, `FAVORITES_PER_PAGE` to a shared `src/constants.ts` _(deferred — low value)_
- [x] Fix the one remaining `+` concatenation in `messages.ts`

## Technical Decisions

| Decision            | Choice                                                                  | Rationale                                                                       |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Shared parser logic | Helper function, not abstract class                                     | Composition over inheritance — parsers stay simple, no class hierarchy overhead |
| 429 handling        | Stop pagination, no retry                                               | Simple and safe; retries add complexity and risk of IP bans                     |
| fetchByUrl          | Optional interface method                                               | Not all parsers need it immediately; existing parsers aren't broken             |
| Constants location  | `base-parser.ts` for parser constants, `constants.ts` for bot constants | Keep constants close to their usage                                             |

## File Structure

```
src/
  parsers/
    base-parser.ts              — NEW: paginatedSearch helper + shared constants
    halooglasi.ts               — refactor to use paginatedSearch
    nekretnine.ts               — refactor to use paginatedSearch
    kupujemprodajem.ts          — refactor to use paginatedSearch
    types.ts                    — add optional fetchByUrl to Parser interface
    registry.ts                 — add fetchByUrl delegation
  scheduler/
    digest.ts                   — rewrite refreshFavoritePrices
  constants.ts                  — NEW: bot-level constants (RESULTS_PER_PAGE, etc.)
  bot/
    messages.ts                 — minor string fix
```

## Risks & Open Questions

- **Risk:** Parser detail pages have different HTML structure than search pages — `fetchByUrl` implementations need separate selectors — **Mitigation:** implement one parser at a time, test with fixture HTML
- **Risk:** Fetching favorites individually (one HTTP request per favorite) could be slow for users with many favorites — **Mitigation:** cap at ~20 favorites per refresh cycle; parallelize with `Promise.all` (bounded concurrency)
- **Question:** Should `fetchByUrl` reuse the detail page parsing that already exists in `detailCaption` display, or parse a minimal set (just price + title)?

## Acceptance Criteria

- [x] Non-200 HTTP responses are logged and handled gracefully (no crashes)
- [x] All three parsers use the shared `paginatedSearch` helper
- [x] Parser tests pass without changes (behavior unchanged)
- [x] `refreshFavoritePrices` fetches each favorite by URL and updates its price
- [x] No scattered magic numbers in parser files
- [x] All tests pass, no type errors
