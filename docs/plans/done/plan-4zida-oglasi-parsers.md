# Plan: 4zida.rs & oglasi.rs Parsers

**Date:** 2026-03-31
**Status:** Completed

## Goal

Add two new property listing parsers (4zida.rs and oglasi.rs) to increase coverage. Both are cheerio-compatible, no login required.

## Current State

- Three parsers: halooglasi, nekretnine, kupujemprodajem
- `ParserRegistry` with `searchAll`/`searchCombined` + per-user site filtering via `enabledSources`
- `base-parser.ts` provides `fetchPage`, `paginatedSearch` (MAX_PAGES=3, PAGE_DELAY=1s)
- Settings UI auto-discovers parsers from `registry.registeredSources`, needs `SOURCE_LABELS` entry

## Research Summary

### 4zida.rs

- **Volume:** 10,700+ house listings
- **Rendering:** Next.js SSR — cheerio-compatible
- **Best parsing approach:** JSON-LD `ItemList` on search pages (structured data with price, size, rooms, image)
- **URL pattern:** `https://www.4zida.rs/prodaja-kuca/{location}?skuplje-od=X&jeftinije-od=X&strana=N`
- **External ID:** 24-char MongoDB ObjectId from URL path
- **Pagination:** `?strana=N`, 20 items/page
- **Price format:** `138.000 €` (dot thousands sep); JSON-LD has numeric value
- **Anti-scraping:** Cloudflare, but no challenge on basic requests. robots.txt permissive for search/listing pages
- **Limitations:**
  - No free-text keyword search via URL — only location in path + numeric filters
  - No plot size filter in URL params
  - Location requires slug matching site format (e.g., `beograd`, `novi-sad`)
  - Sort is client-side only — premium listings always appear first

### oglasi.rs

- **Volume:** 12,200+ house listings
- **Rendering:** PHP SSR with AngularJS UI — cheerio-compatible
- **Best parsing approach:** Schema.org microdata (`itemprop`) on listing cards
- **URL pattern:** `https://www.oglasi.rs/nekretnine/prodaja-kuca/{location}?pr[s]=X&pr[e]=X&pr[c]=EUR&p=N`
- **External ID:** `03-XXXXXXX` from URL path
- **Pagination:** `?p=N`, 24 items/page
- **Price:** `itemprop="price" content="190550.00"` — numeric EUR, no parsing needed
- **Anti-scraping:** Minimal. nginx, no WAF, no CAPTCHA, no rate limit headers. robots.txt only blocks `/oglasi?q=*` (keyword search)
- **Limitations:**
  - No keyword search (robots.txt blocks it)
  - Size/plot filters use predefined buckets, not arbitrary min/max
  - Price is the only true free-range numeric filter

## Proposed Approach

### Phase 1: 4zida.rs parser

**1.1 — URL building**

```
Base: https://www.4zida.rs/prodaja-kuca
```

| SearchParams field | URL mapping                          | Notes                                         |
| ------------------ | ------------------------------------ | --------------------------------------------- |
| `area`             | Path segment: `/prodaja-kuca/{slug}` | Lowercase, hyphenated slug (e.g., `novi-sad`) |
| `keywords`         | **Not supported**                    | Site has no keyword URL param — skip silently |
| `minPrice`         | `?skuplje-od={value}`                | EUR                                           |
| `maxPrice`         | `?jeftinije-od={value}`              | EUR                                           |
| `minSize`          | `?kvadratura-veca-od={value}`        | m²                                            |
| `maxSize`          | `?kvadratura-manja-od={value}`       | m²                                            |
| `minPlotSize`      | **Not supported**                    | No URL param available — skip silently        |
| page               | `?strana={page}`                     | Omit for page 1                               |

Location slug: reuse/adapt the `cityToSlug` helper from nekretnine parser. Serbian diacritics → ASCII, spaces → hyphens, lowercase.

**1.2 — Page parsing (JSON-LD approach)**

Primary: parse `<script type="application/ld+json">` containing `ItemList`:

```typescript
// Each item in JSON-LD:
{
  url: "https://www.4zida.rs/prodaja-kuca/slug/id",
  name: "Location name",
  offers: { price: 138000, priceCurrency: "EUR" },
  itemOffered: {
    floorSize: { value: 156 },
    numberOfRooms: 4
  },
  image: { url: "https://resizer2.4zida.rs/..." }
}
```

Mapping to `Listing`:

| Listing field | Source                             | Extraction                        |
| ------------- | ---------------------------------- | --------------------------------- |
| `externalId`  | URL path last segment              | Regex: `/([a-f0-9]{24})$/`        |
| `source`      | `"4zida"`                          | Hardcoded                         |
| `url`         | `item.url`                         | Direct                            |
| `title`       | `item.name`                        | Direct                            |
| `price`       | `item.offers.price`                | Numeric, already EUR              |
| `size`        | `item.itemOffered.floorSize.value` | Numeric, already m²               |
| `plotSize`    | Not in JSON-LD                     | `null`                            |
| `rooms`       | `item.itemOffered.numberOfRooms`   | Numeric                           |
| `area`        | Parse from card HTML text          | Fallback: extract from URL slug   |
| `city`        | Parse from card HTML text          | Split location: last part is city |
| `imageUrl`    | `item.image.url`                   | Direct                            |

Fallback: if JSON-LD is missing or malformed, parse HTML cards via `div[test-data="ad-search-card"]`.

**1.3 — Pagination detection**

Check if `a[href*="strana=${currentPage + 1}"]` exists in HTML, or if JSON-LD `ItemList` has 20+ items (full page).

**1.4 — Detail page parser (`fetchByUrl`)**

Parse detail page JSON-LD for richer data. External ID from URL regex.

**1.5 — Register and configure**

- Add `SOURCE_LABELS['4zida'] = '4zida.rs'` in `settings.ts`
- Register `new FourZidaParser()` in `index.ts`

Files: `src/parsers/4zida.ts`, `src/parsers/4zida.test.ts`, `src/bot/commands/settings.ts`, `src/index.ts`

### Phase 2: oglasi.rs parser

**2.1 — URL building**

```
Base: https://www.oglasi.rs/nekretnine/prodaja-kuca
```

| SearchParams field | URL mapping                          | Notes                                                 |
| ------------------ | ------------------------------------ | ----------------------------------------------------- |
| `area`             | Path segment: `/prodaja-kuca/{slug}` | Lowercase, hyphenated (e.g., `beograd`, `novi-sad`)   |
| `keywords`         | **Not supported**                    | robots.txt blocks keyword search — skip silently      |
| `minPrice`         | `?pr[s]={value}`                     | EUR                                                   |
| `maxPrice`         | `?pr[e]={value}`                     | EUR                                                   |
| `minSize`          | **Bucket approximation**             | Map to nearest bucket: `d[Kvadratura][N]` (see below) |
| `maxSize`          | **Bucket approximation**             | Same bucket system                                    |
| `minPlotSize`      | **Bucket approximation**             | Map to nearest: `d[Površina zemljišta][N]`            |
| page               | `?p={page}`                          | 1-based                                               |

Always include: `pr[c]=EUR`, `s=d` (newest first).

**Size bucket mapping:**

Site uses predefined buckets: 0-100, 100-200, 200-300, 300-400, 400-500, 500+. For `minSize=80`, select buckets 0-100 and above. Implementation: select all buckets that overlap with the requested range.

Simplification: since our MAX_PAGES=3 (72 results) and price filter is the primary constraint, size bucket approximation is acceptable. Skip size filter if the range doesn't map cleanly — let price + location do the filtering, then post-filter results in code.

**2.2 — Page parsing (Schema.org microdata)**

Listing cards: `article[itemtype="http://schema.org/Product"]`

| Listing field | Selector / Source                       | Extraction                                    |
| ------------- | --------------------------------------- | --------------------------------------------- |
| `externalId`  | URL path: `/oglas/03-XXXXXXX/slug`      | Regex: `/\/oglas\/([\w-]+)\//`                |
| `source`      | `"oglasi"`                              | Hardcoded                                     |
| `url`         | `a.fpogl-list-title[href]`              | Prepend `https://www.oglasi.rs`               |
| `title`       | `h2[itemprop="name"]`                   | Text content                                  |
| `price`       | `span[itemprop="price"]` attr `content` | `parseFloat()`, already EUR                   |
| `size`        | Text containing `Kvadratura:`           | Regex: `/(\d+)\s*m2/` from `<strong>`         |
| `plotSize`    | Text containing `Površina zemljišta:`   | Regex: `/(\d+)\s*m2/`, convert m²→ares (÷100) |
| `rooms`       | Text containing `Broj soba:`            | Parse number from `<strong>` text             |
| `area`        | Breadcrumb links after location         | Text from breadcrumb chain                    |
| `city`        | Breadcrumb: last location segment       | Text content                                  |
| `imageUrl`    | `a.fpogl-list-image img` attr `src`     | Direct URL                                    |

**2.3 — Pagination detection**

Check for link to page N+1 in `.pagination` element, or check if current page has 24 items (full page).

**2.4 — Detail page parser (`fetchByUrl`)**

Parse detail page HTML. External ID from URL regex. Richer data: full description, multiple images, amenities.

**2.5 — Register and configure**

- Add `SOURCE_LABELS['oglasi'] = 'Oglasi.rs'` in `settings.ts`
- Register `new OglasiParser()` in `index.ts`

Files: `src/parsers/oglasi.ts`, `src/parsers/oglasi.test.ts`, `src/bot/commands/settings.ts`, `src/index.ts`

### Phase 3: Tests

Unit tests for both parsers using HTML fixtures (same pattern as existing parser tests):

- **4zida:** fixture with JSON-LD ItemList + HTML cards, test parsing, URL building, edge cases (missing fields, no JSON-LD fallback)
- **oglasi:** fixture with Schema.org microdata cards, test parsing, URL building, price extraction from `content` attr, size bucket mapping, plot size m²→ares conversion

## Technical Decisions

| Decision           | Choice                         | Rationale                                                                             |
| ------------------ | ------------------------------ | ------------------------------------------------------------------------------------- |
| 4zida parsing      | JSON-LD primary, HTML fallback | Structured data is stable; Tailwind classes are fragile                               |
| oglasi parsing     | Schema.org microdata           | Semantic markup is stable; provides numeric price directly                            |
| Keywords on 4zida  | Skip silently                  | No URL param exists; site only supports path-based location                           |
| Keywords on oglasi | Skip silently                  | robots.txt blocks keyword search; category browsing allowed                           |
| oglasi size filter | Post-filter in code            | Bucket system doesn't map to arbitrary min/max; price + location do the heavy lifting |
| oglasi plot size   | Convert m² to ares             | Site reports in m², our interface uses ares                                           |
| Location slugs     | Reuse cityToSlug pattern       | Same Serbian diacritics handling as nekretnine parser                                 |

## File Structure

```
src/
  parsers/
    4zida.ts              — NEW: 4zida.rs parser
    4zida.test.ts         — NEW: 4zida.rs parser tests
    oglasi.ts             — NEW: oglasi.rs parser
    oglasi.test.ts        — NEW: oglasi.rs parser tests
  bot/
    commands/
      settings.ts         — add SOURCE_LABELS entries
  index.ts                — register both parsers
```

## Risks & Open Questions

- **Risk:** 4zida.rs Cloudflare may start challenging requests under load — **Mitigation:** MAX_PAGES=3 with 1s delay keeps volume very low; monitor for 403 responses
- **Risk:** 4zida JSON-LD structure may change — **Mitigation:** fallback to HTML card parsing
- **Risk:** oglasi.rs size bucket system may not filter precisely — **Mitigation:** post-filter results in code after fetching
- **Risk:** Location slug format may not match across sites — **Mitigation:** reuse proven cityToSlug helper; test with common Serbian cities
- **Question:** Should 4zida's lack of keyword search be communicated to the user? Current approach: skip silently, rely on location + price filters. Keywords still work for other parsers in combined search.

## Acceptance Criteria

- [ ] 4zida parser returns listings matching the `Listing` interface
- [ ] 4zida parser handles pagination (up to 3 pages)
- [ ] 4zida parser extracts data from JSON-LD with HTML fallback
- [ ] 4zida parser has unit tests with HTML fixtures
- [ ] 4zida parser registered and appears in site settings
- [ ] oglasi parser returns listings matching the `Listing` interface
- [ ] oglasi parser handles pagination (up to 3 pages)
- [ ] oglasi parser extracts price from Schema.org microdata
- [ ] oglasi parser converts plot size from m² to ares
- [ ] oglasi parser has unit tests with HTML fixtures
- [ ] oglasi parser registered and appears in site settings
- [ ] Both parsers skip unsupported filters silently (no errors)
- [ ] Combined search merges results from all 5 parsers correctly
- [ ] All new settings labels in Russian-friendly format
