# ADR-001: Tech Stack Selection

**Date:** 2026-03-30
**Status:** Accepted

## Context

property-bot is a Telegram bot for searching Serbian property listing sites (halooglasi.com, nekretnine.rs, kupujemprodajem.com). It needs to scrape listings, track price history, send alerts, and store user favorites. Target audience is ~5 users. Hosting should be free or near-free and always-on.

## Options Considered

### Scraping: Puppeteer/Playwright as primary

- Pros: Handles JS-rendered sites, closest to real browser
- Cons: 300-500MB RAM per instance, rules out free-tier hosting, slow (seconds per page), overkill when HTML is server-rendered

### Scraping: axios + cheerio (primary) with Playwright fallback

- Pros: ~5MB memory, millisecond parsing, works on any host. Fallback covers JS-heavy sites if needed
- Cons: Two scraping approaches to maintain. Fallback needs headless browser installed (heavier deploy)

### Database: SQLite vs hosted Postgres (Supabase) vs no DB

- SQLite pros: Zero infrastructure, single file, more than enough for 5 users, works with persistent volume
- SQLite cons: Single-writer, not suitable for multi-instance (not a concern here)
- Postgres pros: Multi-client, hosted free tiers available
- Postgres cons: External dependency, network latency for simple queries, overkill at this scale

### Hosting: Cloudflare Workers vs Fly.io vs Railway vs Serbian VPS

- Cloudflare Workers pros: Generous free tier, global edge
- Cloudflare Workers cons: No persistent process (Telegraf needs long-running or webhook mode), no filesystem for SQLite, 10ms CPU limit on free tier, requires rearchitecting around request/response model
- Fly.io pros: Free tier (3 shared VMs), persistent volumes for SQLite, always-on process, simple deploy
- Fly.io cons: Free tier may change, no Serbian IP, doesn't scale well for multiple bots (each needs its own VM + volume)
- Railway pros: Simple deploy from Git, free tier
- Railway cons: Monthly hours cap on free tier, no persistent volumes, no Serbian IP
- Serbian VPS (JEAP, PlusHosting, MojServer ~€5-8/month) pros: Native Serbian IP, full root access, Docker Compose for multiple bots on one box, can also run VPN/proxy/Nextcloud/torrents, 2GB RAM handles 10+ lightweight bots
- Serbian VPS cons: No free tier, manual server management, less polished DX than PaaS

### Headless browser: Puppeteer vs Playwright

- Puppeteer pros: Already in package.json, Chrome-only (simpler)
- Playwright pros: Multi-browser (Chromium/Firefox/WebKit), better auto-wait API, better maintained
- Playwright cons: Slightly larger install

## Decision

| Layer               | Choice                                           |
| ------------------- | ------------------------------------------------ |
| Runtime             | Node.js + TypeScript                             |
| Bot framework       | Telegraf                                         |
| Scraping (primary)  | `axios` + `cheerio`                              |
| Scraping (fallback) | `playwright` (when a site requires JS rendering) |
| Database            | SQLite via `better-sqlite3`                      |
| Scheduler           | `node-cron` (in-process)                         |
| Config              | `dotenv`                                         |
| Hosting             | Serbian VPS (~€5-8/mo) with Docker Compose       |

**Rationale:**

- **axios + cheerio primary:** halooglasi.com and nekretnine.rs serve listings in server-rendered HTML. No browser needed. This keeps RAM under 100MB and unlocks free-tier hosting.
- **Playwright over Puppeteer as fallback:** Multi-browser support gives more options if a site blocks Chromium. Better API. Only loaded when a parser actually needs it.
- **SQLite:** Price history, favorites, and alert config are simple relational data for 5 users. SQLite is the simplest correct choice. No external service to manage.
- **node-cron:** Bot already runs as a long-lived process. In-process cron for the daily 08:00 CET scrape avoids external infrastructure.
- **Serbian VPS with Docker Compose:** Native Serbian IP for scraping local property sites. Docker Compose lets all current and future Telegram bots run as containers on one machine. A 2GB VPS (~€5-8/month from JEAP, PlusHosting, or MojServer) handles 10+ lightweight Node.js bots. Same box can also run WireGuard VPN, Nextcloud, proxy, or torrent client. Full root access, no vendor lock-in.
- **kupujemprodajem.com deferred:** Requires login, adds session management complexity. Implement after the two public sites are working.

## Consequences

**Positive:**

- Lightweight footprint — bot runs in <100MB RAM (without Playwright)
- Serbian VPS (~€5-8/month) hosts property-bot + future bots on one box via Docker Compose
- Native Serbian IP — no geo-blocking issues with local property sites
- Simple deployment: Docker Compose, each bot is a service with its own container + volume
- VPS doubles as general-purpose server: VPN, cloud storage, proxy, torrents
- Playwright available as escape hatch if any site changes to client-side rendering
- Hosting is portable — no vendor lock-in, just Docker containers + SQLite files

**Negative:**

- Two scraping code paths to maintain (cheerio + Playwright)
- Playwright fallback increases Docker image size when included
- KP support deferred — users won't get KP listings initially
- No free tier — ~€5-8/month cost (but shared across all bots and services)
- Manual server management (Docker, updates, backups) vs managed PaaS

**Dependencies to add:**

```
axios, cheerio, better-sqlite3, node-cron
@types/better-sqlite3, @types/node-cron
```

**Dependencies to remove:**

```
puppeteer (replaced by playwright, loaded only as fallback)
```
