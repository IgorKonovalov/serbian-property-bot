# CLAUDE.md

## Project Overview

**property-bot** is a Telegram bot for searching Serbian real estate sites. It scrapes listings from 5 sources (halooglasi.com, nekretnine.rs, kupujemprodajem.com, 4zida.rs, oglasi.rs), tracks price changes, and sends daily digests. UI is in Russian.

## Architecture

```
src/
  index.ts              — entry point: init db, register parsers, start bot + cron
  config.ts             — env config (BOT_TOKEN, DB_PATH)
  utils.ts              — HTML/URL escaping helpers
  bot/
    bot.ts              — Telegraf init, command registration, error handler
    messages.ts         — all UI strings (Russian)
    commands/            — 7 commands: start, search, profiles, favorites, digest, settings, help
  db/
    database.ts         — SQLite schema, migrations, WAL mode
    queries/            — users, search-profiles, listings, favorites, user-settings
  parsers/
    types.ts            — Listing & Parser interfaces
    base-parser.ts      — shared fetch/pagination logic (max 3 pages, 1s delay, 429 retry)
    registry.ts         — searchAll, searchCombined, fetchByUrl
    utils.ts            — Cyrillic-to-slug conversion
    [5 parsers]         — halooglasi, nekretnine, kupujemprodajem, 4zida, oglasi
  scheduler/
    cron.ts             — daily 08:00 Belgrade time
    digest.ts           — refresh prices + send digests
```

## Tech Stack

- **Runtime:** Node.js 22, TypeScript 6
- **Bot:** Telegraf 4.16
- **Scraping:** axios + cheerio (no headless browser)
- **Database:** SQLite via better-sqlite3 (WAL mode)
- **Scheduler:** node-cron (in-process)
- **Deploy:** Docker Compose on DigitalOcean

## Commands

```bash
npm run dev              # tsx watch mode
npm run build            # tsc compile
npm test                 # jest
npm run test:coverage    # jest --coverage
npm run lint:fix         # eslint --fix
npm run prettier:fix     # prettier --write
```

## Scopes for Commits/Code

| Scope       | Covers                        |
| ----------- | ----------------------------- |
| `bot`       | bot/, commands/, messages     |
| `parsers`   | parsers/, scraping logic      |
| `db`        | db/, queries/, schema         |
| `scheduler` | scheduler/, cron, digest      |
| `types`     | shared type definitions       |
| `utils`     | utility functions             |
| `config`    | config, env, tsconfig, docker |
| `deps`      | dependency changes            |

## Commit Message Guidelines

Follow [Conventional Commits](https://www.conventionalcommits.org/).

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat` — new feature
- `fix` — bug fix
- `refactor` — code change that neither fixes a bug nor adds a feature
- `docs` — documentation only
- `test` — adding or updating tests
- `chore` — build, tooling, config, dependencies
- `style` — formatting, whitespace (no logic change)
- `perf` — performance improvement
- `ci` — CI/CD changes

### Rules

- Subject line: imperative mood, lowercase, no period, max 72 chars
- Body: wrap at 72 chars, explain **why** not **what**
- Footer: reference issues (`Closes #123`) or note breaking changes (`BREAKING CHANGE:`)
- One logical change per commit — don't mix unrelated changes

### Examples

```
feat(bot): add /search command for property lookup

fix(parsers): handle missing price field on halooglasi listings

chore(deps): upgrade puppeteer to v24

refactor(db): extract result formatting into dedicated module

test(parsers): add unit tests for nekretnine parser
```

## Key Patterns

- **Parser contract:** each parser implements `Parser` interface from `parsers/types.ts` — `search()`, optional `fetchByUrl()`, `name`, `supportedFilters`
- **In-memory state:** search and profile commands use `Map<telegramId, State>` with 30-min TTL
- **Error handling:** parsers fail gracefully via `Promise.allSettled` in registry
- **DB migrations:** additive column changes in `database.ts` `initDatabase()`
- **Messages:** all user-facing strings centralized in `bot/messages.ts`

## Testing

- Framework: Jest + ts-jest
- Style: black-box (test behavior, not internals)
- No snapshot tests
- Coverage target: 70%
- Run: `npm test` or `npm run test:coverage`
