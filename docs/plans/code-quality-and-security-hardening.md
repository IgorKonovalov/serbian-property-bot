# Plan: Code Quality and Security Hardening

**Date:** 2026-04-01
**Status:** In Progress

## Goal

Address security vulnerabilities, memory leaks, and code quality issues found during a full codebase audit to make the bot production-hardened and maintainable long-term.

## Current State

The codebase is well-structured with good separation of concerns, parameterized SQL queries, and TypeScript strict mode. However, the audit found:

- **2 critical** issues (memory leaks in unbounded Maps)
- **2 high** issues (incomplete HTML escaping, missing input validation)
- **6 medium** issues (no rate limiting, no URL validation, no HTTP response size limits, no DB retention, inconsistent error handling, no structured logging)
- **4 low** issues (DB file permissions, error log leaking, loose callback regexes, parser fragility)

Plus code quality concerns: duplicated parser utilities, scattered state management, missing tests, hardcoded config values.

## Audit Findings Summary

### Security

| # | Finding | Severity | Location |
|---|---------|----------|----------|
| S1 | `escapeHtml()` doesn't escape quotes (`"`, `'`) | High | `src/utils.ts:1-3` |
| S2 | `escapeUrl()` doesn't validate URL scheme (allows `javascript:`) | Medium | `src/utils.ts:5-7` |
| S3 | No `maxContentLength` on axios requests — 1GB response could OOM | Medium | `src/parsers/base-parser.ts:66-69` |
| S4 | `lastSearchTime` Map never cleaned — grows with every unique user | Critical | `src/bot/commands/search.ts:46` |
| S5 | `userDigestCache` Map never cleaned — stores large Listing arrays | Critical | `src/bot/commands/digest.ts:13` |
| S6 | `userPages` Map in favorites never cleaned | Low | `src/bot/commands/favorites.ts:14` |
| S7 | Price/size inputs have no upper-bound validation | High | `src/bot/commands/search.ts:365-382`, `profiles.ts:57-85` |
| S8 | No bot-wide rate limiting beyond 30s search cooldown | Medium | `src/bot/commands/search.ts:43` |
| S9 | `save_` callback doesn't verify listing belongs to user's results | Medium | `src/bot/commands/search.ts:523` |

### Code Quality

| # | Finding | Severity | Location |
|---|---------|----------|----------|
| Q1 | `parsePrice()`, `parseSize()`, `parseRooms()` duplicated across 5 parsers | Medium | `src/parsers/*.ts` |
| Q2 | State eviction boilerplate duplicated in search.ts and profiles.ts | Medium | `src/bot/commands/search.ts:52-60`, `profiles.ts:34-42` |
| Q3 | Empty catch blocks silently swallow errors (photo upload, JSON-LD) | Medium | `search.ts:511`, `4zida.ts:108`, `kp.ts:146` |
| Q4 | Database operations have no try-catch — errors crash to global handler | Medium | `src/db/queries/*.ts` |
| Q5 | Multi-table DB ops (listing upsert + price history) not wrapped in transaction | Medium | `src/db/queries/listings.ts:48` |
| Q6 | Console logging is inconsistent — no structure, no levels, missing context | Medium | 35 calls across 8 files |
| Q7 | 9+ hardcoded values that should be configurable | Low | Various |
| Q8 | Missing tests: settings command, scheduler, config, user-settings queries | Medium | `src/bot/commands/settings.ts`, `src/scheduler/cron.ts` |

## Proposed Approach

### Phase 1: Critical Security Fixes

Fix memory leaks and input sanitization. These are the highest-risk issues.

- [x] **S1** — Fix `escapeHtml()` in `src/utils.ts` to also escape `"` → `&quot;` and `'` → `&#39;`
- [x] **S2** — Fix `escapeUrl()` in `src/utils.ts` to validate URL scheme is `http:` or `https:`, return empty string otherwise
- [x] **S4** — Add TTL cleanup interval to `lastSearchTime` Map in `src/bot/commands/search.ts` (24h TTL, hourly check)
- [x] **S5** — Add TTL cleanup interval to `userDigestCache` Map in `src/bot/commands/digest.ts` (1h TTL, 5-min check)
- [x] **S6** — Add TTL cleanup interval to `userPages` Map in `src/bot/commands/favorites.ts` (30-min TTL, 5-min check)
- [x] **S3** — Add `maxContentLength: 10 * 1024 * 1024` (10MB) to axios requests in `src/parsers/base-parser.ts`
- [x] **S7** — Add upper-bound validation for price (max €100M) and size (max 100,000 m²) inputs in `search.ts` and `profiles.ts` `parseFilters()`
- [x] Update tests for all changes in this phase

### Phase 2: State Management Consolidation

Extract duplicated state management into a shared module.

- [x] **Q2** — Create `src/bot/state-manager.ts` — generic `TTLMap<K, V>` class with configurable TTL and cleanup interval
- [x] Refactor `search.ts` to use `TTLMap` for `userStates` and `lastSearchTime`
- [x] Refactor `profiles.ts` to use `TTLMap` for `userStates`
- [x] Refactor `digest.ts` to use `TTLMap` for `userDigestCache`
- [x] Refactor `favorites.ts` to use `TTLMap` for `userPages`
- [x] Update tests

### Phase 3: Error Handling and Logging

Consistent error handling and structured logging across the codebase.

- [x] **Q6** — Create `src/logger.ts` with simple structured logger (`info`, `warn`, `error` levels, JSON context, timestamps)
- [x] Replace all `console.log/warn/error` calls with logger (35 call sites across 8 files)
- [x] **Q3** — Add error logging to all empty catch blocks (search photo upload, 4zida/kp JSON-LD parsing)
- [ ] **Q4** (deferred — DB queries already crash to global handler safely) — Add try-catch with logging to database query functions in `src/db/queries/*.ts`
- [x] **Q5** — Wrap listing upsert + price history insert in a transaction in `src/db/queries/listings.ts`
- [x] Sanitize global error handler in `src/bot/bot.ts` — add error ID, don't log full stack to console in production
- [x] Update tests

### Phase 4: Parser Utilities Extraction

Deduplicate parsing logic shared across 5 parsers.

- [x] **Q1** — Create `src/parsers/parse-helpers.ts` with shared `parsePrice()`, `parseSize()`, `parseRooms()`, `parsePlotSize()`
- [x] Refactor halooglasi, nekretnine, kupujemprodajem, 4zida, oglasi parsers to use shared helpers
- [x] Ensure all existing parser tests still pass
- [x] **S9** — In `search.ts` `save_` action, verify `dbId` exists in current user's search results before calling `addFavorite()`

### Phase 5: Remaining Hardening

Lower-priority improvements.

- [x] **S8** — Add simple per-user rate limiter middleware in `src/bot/rate-limiter.ts` (30 requests/minute per user)
- [x] **Q7** — Move hardcoded timing/pagination constants to `src/config.ts` with env var overrides (SESSION_TTL, SEARCH_COOLDOWN, MAX_PARSER_PAGES, REQUEST_TIMEOUT, RESULTS_PER_PAGE, DIGEST_CRON)
- [x] Add DB retention: delete `price_history` rows older than 90 days on startup in `src/db/database.ts`
- [ ] **Q8** (deferred) — Add missing tests for settings command and scheduler modules

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| TTL Map | Custom `TTLMap` class | No need for external dependency (Redis, lru-cache) for ~5 users. Simple `Map` + `setInterval` is sufficient |
| Logger | Custom minimal logger | Project is small, structured logging library (pino, winston) is overkill. Simple function with JSON context covers needs |
| Rate limiter | Custom middleware | Telegraf has no built-in rate limiter. Simple Map-based counter with sliding window is enough at this scale |
| Parser helpers | Shared module, not base class methods | Parsers already extend no base class for parsing. Free functions are simpler and more testable |
| DB retention | Startup cleanup, not cron | Bot restarts infrequently. Running on startup is simple and sufficient |

## File Structure

```
src/
  logger.ts                    — NEW: structured logging
  bot/
    state-manager.ts           — NEW: TTLMap class
    rate-limiter.ts            — NEW: per-user rate limiting middleware
  parsers/
    parse-helpers.ts           — NEW: shared parsePrice/parseSize/parseRooms
```

## Risks & Open Questions

- Risk: Refactoring parsers may introduce regressions — Mitigation: all parsers have existing tests, run full suite after each parser change
- Risk: Logger replacement touches 35 call sites — Mitigation: simple find-and-replace, no logic changes
- Question: Should rate limiter exempt /start and /help? Probably yes — low-cost commands shouldn't burn rate limit budget
- Question: Should DB retention be configurable via env var? Keeping it simple with 90-day default for now

## Acceptance Criteria

- [ ] `escapeHtml()` escapes all 5 HTML special chars (`&`, `<`, `>`, `"`, `'`)
- [ ] `escapeUrl()` rejects non-http(s) URLs
- [ ] All in-memory Maps have TTL cleanup — no Map grows unbounded
- [ ] axios requests have `maxContentLength` set
- [ ] Price/size inputs validated with reasonable upper bounds
- [ ] No duplicated `parsePrice`/`parseSize` across parsers
- [ ] All `console.*` calls replaced with structured logger
- [ ] No empty catch blocks — all log the error
- [ ] DB multi-table operations wrapped in transactions
- [ ] All existing tests pass
- [ ] New tests for TTLMap, rate limiter, parse helpers, settings command
