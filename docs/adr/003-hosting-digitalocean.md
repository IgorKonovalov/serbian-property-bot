# ADR-003: Hosting on DigitalOcean (EU)

**Date:** 2026-03-31
**Status:** Accepted

## Context

The bot needs always-on hosting for multiple Telegram bots (3-5 planned). Requirements:

- Persistent disk for SQLite databases
- Always-on Node.js processes
- Cheap (hobby projects)
- No photo ID verification for signup
- Serbian IP was initially assumed necessary for scraping Serbian property sites

## Research: Geo-blocking (tested 2026-03-31)

| Site                | EU IP (Germany)                | Serbian IP              | Geo-blocked? |
| ------------------- | ------------------------------ | ----------------------- | ------------ |
| halooglasi.com      | Works                          | Works                   | No           |
| nekretnine.rs       | Works                          | Works                   | No           |
| 4zida.rs            | Works (10,712 listings)        | Works (10,661 listings) | No           |
| oglasi.rs           | Works (12,234 listings)        | Works (12,234 listings) | No           |
| kupujemprodajem.com | **Blocked** (maintenance page) | Works (5,486 listings)  | **Yes**      |

Only KupujemProdajem geo-blocks non-Serbian IPs. The other 4 sites provide sufficient coverage.

## Options Considered

### Option A: Serbian VPS (mCloud)

- **Specs:** 1 vCPU, 1 GB RAM, 20 GB SSD
- **Price:** €12/mo
- **Pros:** Native Serbian IP, all 5 sites work
- **Cons:** Expensive for specs, small local provider, limited scalability

### Option B: Hetzner CX23 (Germany)

- **Specs:** 2 vCPU, 4 GB RAM, 40 GB SSD, 20 TB traffic
- **Price:** €3.49/mo
- **Pros:** Best price-to-specs ratio; reliable infrastructure
- **Cons:** Requires photo ID verification for signup

### Option C: DigitalOcean Basic Droplet (Amsterdam)

- **Specs:** 1 vCPU, 1 GB RAM, 25 GB SSD, 1 TB transfer
- **Price:** $6/mo (~€5.50)
- **Pros:** No ID verification (credit card / PayPal only); EU datacenter; excellent docs/UI; reliable
- **Cons:** Less specs than Hetzner for the price; KP still blocked

### Option D: Vultr Cloud Compute (Frankfurt)

- **Specs:** 1 vCPU, 1 GB RAM, 25 GB SSD, 1 TB transfer
- **Price:** $5/mo (~€4.60)
- **Pros:** No ID verification; accepts crypto; EU datacenter
- **Cons:** Less polished UI than DigitalOcean; KP still blocked

### Serbian providers checked

| Provider               | Cheapest VPS                   | Price                 |
| ---------------------- | ------------------------------ | --------------------- |
| mCloud (mcloud.rs)     | 1 vCPU, 1 GB, 20 GB SSD        | €12/mo                |
| Webglobe (webglobe.rs) | 2 vCPU, 2 GB, 40 GB SSD        | ~€37/mo (4,320 RSD)   |
| DreamWeb               | 4 vCPU, 8 GB, 160 GB (managed) | ~€100/mo (11,700 RSD) |
| SuperHosting.rs        | No VPS offering found          | —                     |
| PlusHosting.rs         | SSL certificate expired        | —                     |

## Decision

**DigitalOcean Basic Droplet** — $6/mo (1 vCPU, 1 GB RAM, 25 GB SSD).

- No photo ID required — signup with credit card or PayPal
- Amsterdam datacenter — low latency to Serbia (~30ms)
- 4 working sites (halooglasi, nekretnine, 4zida, oglasi) provide 30,000+ combined listings
- KupujemProdajem can be added later if a Serbian proxy becomes available cheaply
- Reliable infrastructure, excellent documentation, simple UI
- 1 GB RAM is sufficient for 3-5 lightweight Node.js bots with cheerio scraping

## Consequences

- KupujemProdajem parser remains in code but won't return results from an EU IP — users can disable it in settings
- All other parsers (current + future 4zida, oglasi) work without issues
- Single DigitalOcean droplet hosts all bots via Docker Compose
- Deployment via Docker Compose for easy multi-bot management
