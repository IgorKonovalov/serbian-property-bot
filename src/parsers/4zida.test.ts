import {
  buildSearchUrl,
  parsePage,
  parseJsonLd,
  parseHtmlCards,
  hasNextPage,
  parseDetailPage,
} from './4zida'

describe('buildSearchUrl', () => {
  it('builds base URL without filters', () => {
    const url = buildSearchUrl({ keywords: '', area: '' }, 1)
    expect(url).toBe('https://www.4zida.rs/prodaja-kuca')
  })

  it('adds area as path segment slug', () => {
    const url = buildSearchUrl({ keywords: '', area: 'Novi Sad' }, 1)
    expect(url).toBe('https://www.4zida.rs/prodaja-kuca/novi-sad')
  })

  it('handles Serbian diacritics in area', () => {
    const url = buildSearchUrl({ keywords: '', area: 'Čačak' }, 1)
    expect(url).toContain('/prodaja-kuca/cacak')
  })

  it('adds price filters as query params', () => {
    const url = buildSearchUrl(
      { keywords: '', area: '', minPrice: 50000, maxPrice: 200000 },
      1
    )
    expect(url).toContain('skuplje-od=50000')
    expect(url).toContain('jeftinije-od=200000')
  })

  it('adds size filters', () => {
    const url = buildSearchUrl(
      { keywords: '', area: '', minSize: 80, maxSize: 200 },
      1
    )
    expect(url).toContain('kvadratura-veca-od=80')
    expect(url).toContain('kvadratura-manja-od=200')
  })

  it('adds page param for page > 1', () => {
    const url = buildSearchUrl({ keywords: '', area: '' }, 3)
    expect(url).toContain('strana=3')
  })

  it('omits page param for page 1', () => {
    const url = buildSearchUrl({ keywords: '', area: '' }, 1)
    expect(url).not.toContain('strana')
  })

  it('skips keywords silently', () => {
    const url = buildSearchUrl({ keywords: 'banatska kuća', area: '' }, 1)
    expect(url).not.toContain('banatska')
    expect(url).not.toContain('keywords')
  })

  it('skips minPlotSize silently', () => {
    const url = buildSearchUrl({ keywords: '', area: '', minPlotSize: 10 }, 1)
    expect(url).not.toContain('10')
  })
})

describe('parseJsonLd', () => {
  const html = `
    <html><head>
    <script type="application/ld+json">
    {
      "@type": "ItemList",
      "itemListElement": [
        {
          "item": {
            "url": "https://www.4zida.rs/prodaja-kuca/beograd/zemun/abc123def456789012345678",
            "name": "Kuća u Zemunu",
            "offers": { "price": 138000, "priceCurrency": "EUR" },
            "itemOffered": {
              "floorSize": { "value": 156 },
              "numberOfRooms": 4
            },
            "image": { "url": "https://resizer2.4zida.rs/photo.jpg" }
          }
        },
        {
          "item": {
            "url": "https://www.4zida.rs/prodaja-kuca/novi-sad/fedcba987654321012345678",
            "name": "Kuća u Novom Sadu",
            "offers": { "price": 95000 },
            "itemOffered": {
              "floorSize": { "value": 80 }
            },
            "image": "https://resizer2.4zida.rs/photo2.jpg"
          }
        }
      ]
    }
    </script>
    </head><body></body></html>
  `

  it('extracts all listings from JSON-LD', () => {
    const listings = parseJsonLd(html)
    expect(listings).toHaveLength(2)
  })

  it('parses listing fields correctly', () => {
    const [first] = parseJsonLd(html)
    expect(first.externalId).toBe('abc123def456789012345678')
    expect(first.source).toBe('4zida')
    expect(first.title).toBe('Kuća u Zemunu')
    expect(first.url).toContain('abc123def456789012345678')
    expect(first.price).toBe(138000)
    expect(first.size).toBe(156)
    expect(first.rooms).toBe(4)
    expect(first.imageUrl).toBe('https://resizer2.4zida.rs/photo.jpg')
    expect(first.plotSize).toBeNull()
  })

  it('extracts location from URL path', () => {
    const [first] = parseJsonLd(html)
    expect(first.city).toBe('beograd')
    expect(first.area).toBe('zemun')
  })

  it('handles missing optional fields', () => {
    const listings = parseJsonLd(html)
    expect(listings[1].rooms).toBeNull()
  })

  it('handles string image format', () => {
    const listings = parseJsonLd(html)
    expect(listings[1].imageUrl).toBe('https://resizer2.4zida.rs/photo2.jpg')
  })

  it('returns empty array for non-ItemList JSON-LD', () => {
    const otherHtml = `
      <script type="application/ld+json">{"@type": "WebPage"}</script>
    `
    expect(parseJsonLd(otherHtml)).toHaveLength(0)
  })

  it('returns empty array for malformed JSON', () => {
    const badHtml = `
      <script type="application/ld+json">not json at all</script>
    `
    expect(parseJsonLd(badHtml)).toHaveLength(0)
  })
})

describe('parseHtmlCards', () => {
  const html = `
    <div test-data="ad-search-card">
      <a href="/prodaja-kuca/beograd/abc123def456789012345678">
        <h2>Kuća Beograd</h2>
      </a>
      <div class="price">150.000 €</div>
      <span>120 m²</span>
      <img src="https://img.4zida.rs/thumb.jpg" />
    </div>
  `

  it('extracts listings from HTML cards', () => {
    const listings = parseHtmlCards(html)
    expect(listings).toHaveLength(1)
    expect(listings[0].externalId).toBe('abc123def456789012345678')
    expect(listings[0].source).toBe('4zida')
    expect(listings[0].price).toBe(150000)
    expect(listings[0].size).toBe(120)
    expect(listings[0].imageUrl).toBe('https://img.4zida.rs/thumb.jpg')
  })

  it('returns empty for cards without valid links', () => {
    const badHtml = `<div test-data="ad-search-card"><a href="/other">X</a></div>`
    expect(parseHtmlCards(badHtml)).toHaveLength(0)
  })
})

describe('parsePage', () => {
  it('prefers JSON-LD over HTML cards', () => {
    const html = `
      <script type="application/ld+json">
      {
        "@type": "ItemList",
        "itemListElement": [{
          "item": {
            "url": "https://www.4zida.rs/prodaja-kuca/bg/abc123def456789012345678",
            "name": "JSON-LD Listing",
            "offers": { "price": 100000 }
          }
        }]
      }
      </script>
      <div test-data="ad-search-card">
        <a href="/prodaja-kuca/bg/fedcba987654321012345678"><h2>HTML Card</h2></a>
      </div>
    `
    const listings = parsePage(html)
    expect(listings).toHaveLength(1)
    expect(listings[0].title).toBe('JSON-LD Listing')
  })

  it('falls back to HTML cards when no JSON-LD', () => {
    const html = `
      <div test-data="ad-search-card">
        <a href="/prodaja-kuca/bg/abc123def456789012345678"><h2>Fallback</h2></a>
        <div class="price">50.000 €</div>
      </div>
    `
    const listings = parsePage(html)
    expect(listings).toHaveLength(1)
    expect(listings[0].title).toBe('Fallback')
  })
})

describe('hasNextPage', () => {
  it('returns true when next page link exists', () => {
    const html = `<a href="?strana=3">3</a>`
    expect(hasNextPage(html, 2)).toBe(true)
  })

  it('returns false for empty page', () => {
    const html = `<div>No results</div>`
    expect(hasNextPage(html, 1)).toBe(false)
  })
})

describe('parseDetailPage', () => {
  it('parses detail page with JSON-LD', () => {
    const html = `
      <html><head>
      <script type="application/ld+json">
      {
        "@type": "SingleFamilyResidence",
        "name": "Detail Listing",
        "offers": { "price": 250000 },
        "floorSize": { "value": 200 },
        "numberOfRooms": 5,
        "image": "https://img.4zida.rs/detail.jpg"
      }
      </script>
      </head><body></body></html>
    `
    const url =
      'https://www.4zida.rs/prodaja-kuca/beograd/abc123def456789012345678'
    const listing = parseDetailPage(html, url)
    expect(listing).not.toBeNull()
    expect(listing!.externalId).toBe('abc123def456789012345678')
    expect(listing!.title).toBe('Detail Listing')
    expect(listing!.price).toBe(250000)
    expect(listing!.size).toBe(200)
    expect(listing!.rooms).toBe(5)
  })

  it('falls back to HTML when no JSON-LD', () => {
    const html = `
      <html><body>
        <h1>HTML Title</h1>
        <div class="price">300.000 €</div>
        <meta property="og:image" content="https://img.4zida.rs/og.jpg" />
      </body></html>
    `
    const url = 'https://www.4zida.rs/prodaja-kuca/ns/abc123def456789012345678'
    const listing = parseDetailPage(html, url)
    expect(listing).not.toBeNull()
    expect(listing!.title).toBe('HTML Title')
    expect(listing!.price).toBe(300000)
    expect(listing!.imageUrl).toBe('https://img.4zida.rs/og.jpg')
  })

  it('returns null for invalid URL', () => {
    const listing = parseDetailPage(
      '<html></html>',
      'https://www.4zida.rs/invalid'
    )
    expect(listing).toBeNull()
  })
})
