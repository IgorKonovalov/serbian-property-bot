# property-bot

Telegram bot for searching Serbian real estate listings. Scrapes 5 property sites, tracks price changes, and sends daily digests.

## Features

- **Multi-site search** — halooglasi.com, nekretnine.rs, kupujemprodajem.com, 4zida.rs, oglasi.rs
- **Search profiles** — save and reuse search criteria (keywords, price, size, area filters)
- **Favorites** — bookmark listings for tracking
- **Price tracking** — detect and report price changes on saved listings
- **Daily digest** — automated morning summary of new listings and price changes (08:00 Belgrade time)
- **Per-site settings** — enable/disable individual sources

## Tech Stack

| Layer         | Technology              |
| ------------- | ----------------------- |
| Language      | TypeScript 6            |
| Runtime       | Node.js 22              |
| Bot framework | Telegraf                |
| Scraping      | axios + cheerio         |
| Database      | SQLite (better-sqlite3) |
| Scheduler     | node-cron               |
| Deploy        | Docker Compose          |

## Quick Start

### Prerequisites

- Node.js 22+
- Telegram bot token from [@BotFather](https://t.me/BotFather)

### Setup

```bash
# Clone
git clone <repo-url>
cd property-bot

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and add your BOT_TOKEN

# Run in development mode
npm run dev
```

### Environment Variables

| Variable    | Required | Default                | Description            |
| ----------- | -------- | ---------------------- | ---------------------- |
| `BOT_TOKEN` | Yes      | —                      | Telegram bot API token |
| `DB_PATH`   | No       | `data/property-bot.db` | SQLite database path   |

## Commands

| Script                  | Description                       |
| ----------------------- | --------------------------------- |
| `npm run dev`           | Start with hot reload (tsx watch) |
| `npm run build`         | Compile TypeScript                |
| `npm start`             | Run compiled build                |
| `npm test`              | Run tests                         |
| `npm run test:coverage` | Run tests with coverage report    |
| `npm run lint:fix`      | Fix linting issues                |
| `npm run prettier:fix`  | Format code                       |

## Bot Commands

| Command      | Description                        |
| ------------ | ---------------------------------- |
| `/start`     | Main menu                          |
| `/search`    | Interactive property search        |
| `/profiles`  | Manage saved search profiles       |
| `/favorites` | View bookmarked listings           |
| `/digest`    | Get price changes and new listings |
| `/settings`  | Configure enabled sites            |
| `/help`      | Usage guide                        |

## Supported Property Sites

| Site                                                   | Filters                                       |
| ------------------------------------------------------ | --------------------------------------------- |
| [halooglasi.com](https://www.halooglasi.com)           | Keywords, area, price, size, plot size, rooms |
| [nekretnine.rs](https://www.nekretnine.rs)             | Area, price ranges, size buckets              |
| [kupujemprodajem.com](https://www.kupujemprodajem.com) | Keywords, area, price, size, rooms            |
| [4zida.rs](https://www.4zida.rs)                       | Price, size, rooms                            |
| [oglasi.rs](https://www.oglasi.rs)                     | Price                                         |

## Docker Deployment

```bash
# Build and run
docker compose up -d --build

# View logs
docker compose logs -f

# Stop
docker compose down
```

The SQLite database is persisted via a Docker volume mount (`./data:/app/data`).

See [docs/deployment.md](docs/deployment.md) for full server setup guide.

## Project Structure

```
src/
  index.ts                 Entry point
  config.ts                Environment configuration
  bot/
    bot.ts                 Bot initialization
    messages.ts            UI strings (Russian)
    commands/              Command handlers
  db/
    database.ts            Schema & migrations
    queries/               Data access layer
  parsers/
    base-parser.ts         Shared scraping logic
    registry.ts            Multi-parser orchestration
    [5 site parsers]       Site-specific scrapers
  scheduler/
    cron.ts                Daily job scheduling
    digest.ts              Digest generation
```

## Architecture Decisions

See [docs/adr/](docs/adr/) for Architecture Decision Records:

- [001 — Tech Stack](docs/adr/001-tech-stack.md)
- [002 — Russian UI](docs/adr/002-russian-ui.md)
- [003 — Hosting](docs/adr/003-hosting-digitalocean.md)

## License

[MIT](LICENSE)
