import {
  buildSearchUrl,
  parsePage,
  hasNextPage,
  parseDetailPage,
} from './oglasi'

describe('buildSearchUrl', () => {
  it('builds base URL with default params', () => {
    const url = buildSearchUrl({ keywords: '', area: '' }, 1)
    expect(url).toContain('https://www.oglasi.rs/nekretnine/prodaja-kuca')
    expect(url).toContain('pr%5Bc%5D=EUR')
    expect(url).toContain('s=d')
  })

  it('adds area as path segment slug', () => {
    const url = buildSearchUrl({ keywords: '', area: 'Novi Sad' }, 1)
    expect(url).toContain('/prodaja-kuca/novi-sad')
  })

  it('handles Serbian diacritics', () => {
    const url = buildSearchUrl({ keywords: '', area: 'Šabac' }, 1)
    expect(url).toContain('/prodaja-kuca/sabac')
  })

  it('adds price filters', () => {
    const url = buildSearchUrl(
      { keywords: '', area: '', minPrice: 50000, maxPrice: 200000 },
      1
    )
    expect(url).toContain('pr%5Bs%5D=50000')
    expect(url).toContain('pr%5Be%5D=200000')
  })

  it('adds page param for page > 1', () => {
    const url = buildSearchUrl({ keywords: '', area: '' }, 2)
    expect(url).toContain('p=2')
  })

  it('omits page param for page 1', () => {
    const url = buildSearchUrl({ keywords: '', area: '' }, 1)
    expect(url).not.toMatch(/p=1/)
  })

  it('skips keywords silently', () => {
    const url = buildSearchUrl({ keywords: 'kuća', area: '' }, 1)
    expect(url).not.toContain('kuća')
    expect(url).not.toContain('keywords')
  })

  it('skips size filters (bucket system)', () => {
    const url = buildSearchUrl(
      { keywords: '', area: '', minSize: 80, maxSize: 200 },
      1
    )
    expect(url).not.toContain('80')
    expect(url).not.toContain('200')
  })
})

describe('parsePage', () => {
  const html = `
    <article itemtype="http://schema.org/Product" itemscope>
      <a class="fpogl-list-title" href="/oglas/03-1234567/kuca-beograd/">
        <h2 itemprop="name">Kuća u Beogradu</h2>
      </a>
      <span itemprop="price" content="190550.00">190.550 €</span>
      <div class="fpogl-list-location">Beograd, Zemun</div>
      <strong>Kvadratura: 120 m2</strong>
      <strong>Površina zemljišta: 500 m2</strong>
      <strong>Broj soba: 4</strong>
      <a class="fpogl-list-image"><img src="https://img.oglasi.rs/thumb.jpg" /></a>
    </article>
    <article itemtype="http://schema.org/Product" itemscope>
      <a class="fpogl-list-title" href="/oglas/03-7654321/kuca-ns/">
        <h2 itemprop="name">Kuća Novi Sad</h2>
      </a>
      <span itemprop="price" content="75000.00">75.000 €</span>
      <div class="fpogl-list-location">Novi Sad</div>
    </article>
  `

  it('extracts all listings', () => {
    const listings = parsePage(html)
    expect(listings).toHaveLength(2)
  })

  it('parses listing fields correctly', () => {
    const [first] = parsePage(html)
    expect(first.externalId).toBe('03-1234567')
    expect(first.source).toBe('oglasi')
    expect(first.title).toBe('Kuća u Beogradu')
    expect(first.url).toBe(
      'https://www.oglasi.rs/oglas/03-1234567/kuca-beograd/'
    )
    expect(first.price).toBe(190550)
    expect(first.size).toBe(120)
    expect(first.rooms).toBe(4)
    expect(first.imageUrl).toBe('https://img.oglasi.rs/thumb.jpg')
  })

  it('converts plot size from m² to ares', () => {
    const [first] = parsePage(html)
    expect(first.plotSize).toBe(5) // 500 m² = 5 ares
  })

  it('extracts location parts', () => {
    const [first] = parsePage(html)
    expect(first.city).toBe('Beograd')
    expect(first.area).toBe('Zemun')
  })

  it('handles missing optional fields', () => {
    const listings = parsePage(html)
    expect(listings[1].size).toBeNull()
    expect(listings[1].plotSize).toBeNull()
    expect(listings[1].rooms).toBeNull()
    expect(listings[1].imageUrl).toBeNull()
  })

  it('handles single location without area', () => {
    const listings = parsePage(html)
    expect(listings[1].city).toBe('Novi Sad')
    expect(listings[1].area).toBeNull()
  })

  it('returns empty for no matching articles', () => {
    expect(parsePage('<div>No results</div>')).toHaveLength(0)
  })

  it('skips articles without valid links', () => {
    const badHtml = `
      <article itemtype="http://schema.org/Product" itemscope>
        <a class="fpogl-list-title" href="/other-page">No ID</a>
      </article>
    `
    expect(parsePage(badHtml)).toHaveLength(0)
  })
})

describe('hasNextPage', () => {
  it('returns true when next page link exists', () => {
    const html = `<div class="pagination"><a href="?p=3">3</a></div>`
    expect(hasNextPage(html, 2)).toBe(true)
  })

  it('returns false for empty page', () => {
    const html = `<div>No results</div>`
    expect(hasNextPage(html, 1)).toBe(false)
  })

  it('returns true when page has full 24 items', () => {
    const cards = Array(24)
      .fill(null)
      .map(
        (_, i) => `
        <article itemtype="http://schema.org/Product" itemscope>
          <a class="fpogl-list-title" href="/oglas/03-${String(i).padStart(7, '0')}/slug/">
            <h2 itemprop="name">Item ${i}</h2>
          </a>
          <span itemprop="price" content="1000">1000</span>
        </article>
      `
      )
      .join('')
    expect(hasNextPage(cards, 1)).toBe(true)
  })
})

describe('parseDetailPage', () => {
  it('parses detail page fields', () => {
    const html = `
      <html><body>
        <h1>Detail Kuća</h1>
        <span itemprop="price" content="250000.00">250.000 €</span>
        <div class="oglas-detail">
          Kvadratura: 180 m2
          Površina zemljišta: 1000 m2
          Broj soba: 5
        </div>
        <div class="oglas-location">Beograd, Voždovac</div>
        <meta property="og:image" content="https://img.oglasi.rs/detail.jpg" />
      </body></html>
    `
    const url = 'https://www.oglasi.rs/oglas/03-9999999/kuca-beograd/'
    const listing = parseDetailPage(html, url)
    expect(listing).not.toBeNull()
    expect(listing!.externalId).toBe('03-9999999')
    expect(listing!.title).toBe('Detail Kuća')
    expect(listing!.price).toBe(250000)
    expect(listing!.size).toBe(180)
    expect(listing!.plotSize).toBe(10) // 1000 m² = 10 ares
    expect(listing!.rooms).toBe(5)
    expect(listing!.imageUrl).toBe('https://img.oglasi.rs/detail.jpg')
  })

  it('returns null for invalid URL', () => {
    const listing = parseDetailPage(
      '<html></html>',
      'https://www.oglasi.rs/invalid'
    )
    expect(listing).toBeNull()
  })
})
