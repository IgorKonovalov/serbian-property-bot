# Test Coverage Plan — Target 70%

## Current State (as of 2026-03-30)

**Overall coverage: ~37% statements** (144 tests passing across 10 test suites)

## Completed Tests

| File                                | Test File                 | Tests | Coverage                                          |
| ----------------------------------- | ------------------------- | ----- | ------------------------------------------------- |
| `src/db/queries/users.ts`           | `users.test.ts`           | 7     | 100%                                              |
| `src/db/queries/listings.ts`        | `listings.test.ts`        | 11    | 100%                                              |
| `src/db/queries/search-profiles.ts` | `search-profiles.test.ts` | 15    | ~86%                                              |
| `src/db/queries/favorites.ts`       | `favorites.test.ts`       | 9     | 100%                                              |
| `src/db/database.ts`                | (covered via query tests) | —     | ~86%                                              |
| `src/scheduler/digest.ts`           | `digest.test.ts`          | 12    | ~47% (pure formatting fns covered, async fns not) |
| `src/bot/messages.ts`               | `messages.test.ts`        | 18    | 100%                                              |
| `src/utils.ts`                      | `utils.test.ts`           | 6     | 100%                                              |
| `src/parsers/*`                     | (pre-existing)            | 66    | ~78-90%                                           |

## Tests Written But NOT Working — Bot Commands

6 test files were created but **all fail** due to Telegraf mocking issue:

- `src/bot/commands/start.test.ts`
- `src/bot/commands/help.test.ts`
- `src/bot/commands/favorites.test.ts`
- `src/bot/commands/profiles.test.ts`
- `src/bot/commands/search.test.ts`
- `src/bot/commands/digest.test.ts`

### The Mocking Problem

Telegraf v4.16.3's `callApi` method cannot be mocked via:

- `bot.telegram.callApi = jest.fn()` — not intercepted
- `jest.spyOn(bot.telegram, 'callApi')` — not intercepted
- `bot.telegram.sendMessage = jest.fn()` — not intercepted

The `ctx.reply()` → `telegram.sendMessage()` → `callApi()` chain always hits the real HTTP client (`node-fetch`), returning 404 with the fake token.

### Possible Solutions (not yet tried)

1. **Mock `node-fetch`** at module level: `jest.mock('node-fetch', () => jest.fn(...))`
2. **Mock at prototype level**: `Object.getPrototypeOf(Object.getPrototypeOf(bot.telegram)).callApi = jest.fn()`
3. **Use `nock`** library to intercept HTTP requests to `api.telegram.org`
4. **Extract business logic** from command handlers into pure functions, test those separately (avoids mocking Telegraf entirely)
5. **Check if callApi uses private #field** or class field declaration that prevents property override

Option 4 is the cleanest architecturally but requires refactoring the command files.

## Remaining Gaps to Reach 70%

### Must Fix (bot/commands — 0% coverage, ~1091 lines)

These are the biggest gap. The 6 test files above cover all handler logic but need the mock issue resolved.

Files and approximate line counts:

- `search.ts` — 393 lines
- `profiles.ts` — 338 lines
- `favorites.ts` — 195 lines
- `help.ts` — 78 lines
- `digest.ts` — 66 lines
- `start.ts` — 21 lines

### Minor Gaps (low priority)

- `src/config.ts` — 0%, 14 lines (loads env vars at import time, hard to test)
- `src/bot/bot.ts` — 0%, 26 lines (bot factory, just wires things)
- `src/scheduler/cron.ts` — 0%, 24 lines (cron setup, side-effect heavy)
- `src/scheduler/digest.ts` async functions — ~50% uncovered (buildDigestData, sendDigestToAll, refreshFavoritePrices — these also need Telegraf/registry mocking)

### search-profiles.ts Branch Gaps

Lines 105-118 uncovered — these are the `updateProfile` branches for `minSize`, `maxSize`, `minPlotSize`, `isActive` fields. Easy to add.

## Priority Order

1. **Fix Telegraf mocking** — this alone would bring coverage from ~37% to ~65-70%
2. **Add missing updateProfile branch tests** — easy win, +2-3%
3. **Test digest async functions** with mocked registry — +3-5%
4. **config.ts / bot.ts / cron.ts** — diminishing returns, skip unless needed

## Testing Constraints (from user)

- **Blackbox testing only** — test inputs/outputs, no implementation coupling
- **No snapshot testing**
- **Target: 70% statement coverage**
