# Plan: Digest Overhaul — Pagination, Favorites Section, Filtering, Bug Fix

**Date:** 2026-04-03
**Status:** Completed

## Goal

Fix the critical bug where scheduled digest buttons don't work, then improve the digest with pagination, a dedicated favorites-changes section, and price filtering for new listings.

## Current State

The digest system has two entry points:

1. **Scheduled cron** (`sendDigestToAll`) — sends summary via `bot.telegram.sendMessage()` with inline buttons
2. **`/digest` command** — builds data, caches it in `userDigestCache` TTLMap, shows same summary

### Bug: Scheduled digest buttons are broken

**Root cause:** When the scheduler sends a digest, it does NOT populate `userDigestCache`. When the user taps `digest_new`, the callback handler (line 62-77 of `digest.ts`) looks up `userDigestCache.get(ctx.from.id)` — finds nothing — and responds with "no data". The 300 listings existed during send but were never cached.

### Other limitations

- New listings capped at 10, no pagination (`buildNewListingsMessage` slices to `[0, 10]`)
- Price changes show all favorites in a flat list, no pagination
- No way to filter new listings (e.g. by price range)
- No separation between "price changes on my favorites" vs "new listings from profiles" — they share a single digest view

## Proposed Approach

### Phase 1: Fix the scheduled digest bug (critical)

- [ ] In `sendDigestToAll()`, after building `DigestData`, store it in a **persistent cache** keyed by `telegram_id` so that callback handlers can retrieve it
- [ ] Two options for cache persistence — see Technical Decisions below
- [ ] Add a fallback in callback handlers: if cache miss, attempt to rebuild data before giving up

**Files:** `scheduler/digest.ts`, `bot/commands/digest.ts`

### Phase 2: Pagination for new listings and price changes

- [ ] Add page state to digest cache: `{ data: DigestData, newPage: number, pricePage: number }`
- [ ] Update `buildNewListingsMessage()` to accept page number, show `RESULTS_PER_PAGE` items per page (reuse config value, default 5)
- [ ] Add prev/next navigation buttons to new listings view: `dpage_new_{page}` callback pattern
- [ ] Same pagination for price changes view: `dpage_price_{page}` callback pattern
- [ ] Show "page X of Y" indicator in message text
- [ ] Use `editMessageText` for page navigation (not new messages) to keep chat clean

**Files:** `scheduler/digest.ts`, `bot/commands/digest.ts`, `bot/messages.ts`

### Phase 3: Separate favorites price-changes section

- [ ] Restructure digest summary to show three sections:
  - `digest_new` — new listings from search profiles (existing)
  - `digest_fav_changes` — price changes on user's favorites (renamed from `digest_prices`)
  - Keep counts in summary for both
- [ ] Update summary message format:

  ```
  🏠 Дайджест

  🆕 Новых: 300
  ⭐ Изменения в избранном: 5
  ```

- [ ] Add button: `⭐ Избранное (5 изм.)` → shows paginated list of favorite price changes
- [ ] Each favorite change shows: title, old→new price, % change, link

**Files:** `scheduler/digest.ts`, `bot/commands/digest.ts`, `bot/messages.ts`

### Phase 4: Price filtering for new listings

- [ ] Add filter buttons row above pagination in new listings view:
  - `dflt_price` — toggles a price range filter
  - When tapped, show preset price buckets: `< €50k`, `€50-100k`, `€100-200k`, `€200k+`, `All`
  - Callback pattern: `dflt_price_{bucket}`
- [ ] Filter is applied client-side from cached `newListings` array (no re-scraping)
- [ ] Active filter shown in message header: `🆕 Новые (€50-100k):`
- [ ] Filter state stored alongside page state in cache
- [ ] Reset page to 0 when filter changes

**Files:** `bot/commands/digest.ts`, `scheduler/digest.ts`, `bot/messages.ts`

## Technical Decisions

| Decision                    | Choice                                                        | Rationale                                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cache for scheduled digest  | In-memory TTLMap shared between scheduler and command handler | DB storage is overkill — digest data is transient and rebuilt daily. A module-level TTLMap exported from `digest.ts` with 12h TTL covers the gap. The scheduler writes it, callbacks read it. |
| Pagination approach         | `editMessageText` with callback data encoding page            | Consistent with search and favorites commands. Avoids message spam.                                                                                                                           |
| Price filter implementation | Client-side filter on cached array                            | Data is already in memory. Re-scraping for filters would be slow and wasteful. Preset buckets keep UI simple (no free-text input needed).                                                     |
| Cache key                   | `telegram_id` (not internal `user_id`)                        | Callback context provides `ctx.from.id` (telegram_id). Avoids DB lookup on every button tap.                                                                                                  |

## File Changes

```
src/
  scheduler/
    digest.ts           — export shared cache, populate in sendDigestToAll, add pagination/filter helpers
  bot/
    commands/
      digest.ts         — consume shared cache, add pagination/filter callbacks, restructure sections
    messages.ts         — new message templates for pagination, filters, favorites section
```

No new files needed. No DB schema changes.

## Risks & Open Questions

- **Telegram message length limit (4096 chars):** With 5 listings per page this is safe (~200 chars per listing = ~1000 chars). No risk.
- **Memory usage with 300+ listings cached per user:** Each `Listing` is ~500 bytes, 300 listings ≈ 150KB per user. With TTL cleanup this is negligible.
- **Price buckets may not suit all markets:** Hardcoded EUR buckets. Could make configurable later but YAGNI for now.
- **Question:** Should the "save to favorites" action be available from digest new listings? → Recommend yes in a follow-up, but out of scope for this plan to keep it focused.

## Acceptance Criteria

- [ ] Tapping "New listings" button on a **scheduled** digest shows listings (not "no data")
- [ ] New listings view shows 5 per page with prev/next navigation
- [ ] Price changes view shows 5 per page with prev/next navigation
- [ ] Digest summary has separate buttons for new listings and favorite price changes
- [ ] Price filter buttons appear in new listings view; selecting a bucket filters the list
- [ ] All pagination uses `editMessageText` (no new messages on page change)
- [ ] Existing `/digest` command continues to work
- [ ] All existing tests pass; new tests cover pagination and filter logic
