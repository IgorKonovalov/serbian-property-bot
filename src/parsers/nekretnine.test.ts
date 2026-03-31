import {
  cityToSlug,
  buildSearchUrl,
  parsePrice,
  parseSize,
  parsePage,
  hasNextPage,
} from './nekretnine'

describe('cityToSlug', () => {
  it('converts simple city name', () => {
    expect(cityToSlug('Beograd')).toBe('beograd')
  })

  it('converts multi-word city name', () => {
    expect(cityToSlug('Novi Sad')).toBe('novi-sad')
  })

  it('handles Serbian diacritics', () => {
    expect(cityToSlug('Čačak')).toBe('cacak')
    expect(cityToSlug('Niš')).toBe('nis')
    expect(cityToSlug('Đurđevo')).toBe('djurdjevo')
    expect(cityToSlug('Šabac')).toBe('sabac')
    expect(cityToSlug('Žabalj')).toBe('zabalj')
  })
})

describe('buildSearchUrl', () => {
  it('builds basic URL with area', () => {
    const url = buildSearchUrl({ keywords: 'kuća', area: 'Novi Sad' }, 1)
    expect(url).toContain('/prodaja/')
    expect(url).toContain('/grad/novi-sad/')
    expect(url).toContain('/po-stranici/20/')
    expect(url).not.toContain('/stranica/')
  })

  it('adds pagination for page > 1', () => {
    const url = buildSearchUrl({ keywords: 'kuća', area: '' }, 2)
    expect(url).toContain('/stranica/2/')
  })

  it('includes price range', () => {
    const url = buildSearchUrl(
      { keywords: '', area: '', minPrice: 50000, maxPrice: 200000 },
      1
    )
    expect(url).toContain('/cena/50000_200000/')
  })

  it('includes size range', () => {
    const url = buildSearchUrl(
      { keywords: '', area: '', minSize: 80, maxSize: 200 },
      1
    )
    expect(url).toContain('/kvadratura/80_200/')
  })

  it('uses defaults for open-ended ranges', () => {
    const url = buildSearchUrl({ keywords: '', area: '', minPrice: 50000 }, 1)
    expect(url).toContain('/cena/50000_10000000/')
  })

  it('omits filters when not set', () => {
    const url = buildSearchUrl({ keywords: '', area: '' }, 1)
    expect(url).not.toContain('/cena/')
    expect(url).not.toContain('/kvadratura/')
    expect(url).not.toContain('/grad/')
  })
})

describe('parsePrice', () => {
  it('parses space-separated price', () => {
    expect(parsePrice('690 000 €')).toBe(690000)
  })

  it('parses simple price', () => {
    expect(parsePrice('2 100 €')).toBe(2100)
  })

  it('returns null for undefined', () => {
    expect(parsePrice(undefined)).toBeNull()
  })

  it('returns null for empty', () => {
    expect(parsePrice('')).toBeNull()
  })
})

describe('parseSize', () => {
  it('parses integer size', () => {
    expect(parseSize('220 m²')).toBe(220)
  })

  it('parses decimal size', () => {
    expect(parseSize('113.55 m²')).toBe(114)
  })

  it('parses comma decimal', () => {
    expect(parseSize('113,55 m²')).toBe(114)
  })

  it('returns null for undefined', () => {
    expect(parseSize(undefined)).toBeNull()
  })
})

describe('parsePage', () => {
  const html = `
    <div class="row offer">
      <div class="offer-body">
        <h2 class="offer-title">
          <a href="/stambeni-objekti/kuce/test-house/ABC123/">Test House Novi Sad</a>
        </h2>
        <p class="offer-price">
          <span>150 000 €</span>
          <small>750 €/m²</small>
        </p>
        <p class="offer-price offer-price--invert">
          <span>200 m²</span>
        </p>
        <div class="offer-location">Liman, Novi Sad, Srbija</div>
        <div class="offer-adress">01.01.2026  |  Prodaja  |  Porodična kuća</div>
      </div>
    </div>
    <div class="row offer">
      <div class="offer-body">
        <h2 class="offer-title">
          <a href="/stambeni-objekti/kuce/rental/DEF456/">Rental House</a>
        </h2>
        <p class="offer-price"><span>500 €</span></p>
        <p class="offer-price offer-price--invert"><span>100 m²</span></p>
        <div class="offer-location">Beograd, Srbija</div>
        <div class="offer-adress">01.01.2026  |  Izdavanje  |  Kuća</div>
      </div>
    </div>
    <div class="row offer">
      <div class="offer-body">
        <h2 class="offer-title">
          <a href="/stambeni-objekti/kuce/no-price/GHI789/">No Price House</a>
        </h2>
        <p class="offer-price"><span>Po dogovoru</span></p>
        <p class="offer-price offer-price--invert"><span>85 m²</span></p>
        <div class="offer-location">Niš, Srbija</div>
        <div class="offer-adress">01.01.2026  |  Prodaja  |  Kuća</div>
      </div>
    </div>
  `

  it('extracts sale listings and skips rentals', () => {
    const listings = parsePage(html)
    expect(listings).toHaveLength(2)
    expect(listings.every((l) => l.title !== 'Rental House')).toBe(true)
  })

  it('parses listing fields correctly', () => {
    const [first] = parsePage(html)
    expect(first.externalId).toBe('ABC123')
    expect(first.source).toBe('nekretnine')
    expect(first.title).toBe('Test House Novi Sad')
    expect(first.url).toBe(
      'https://www.nekretnine.rs/stambeni-objekti/kuce/test-house/ABC123/'
    )
    expect(first.price).toBe(150000)
    expect(first.size).toBe(200)
    expect(first.city).toBe('Novi Sad')
    expect(first.area).toBe('Liman')
  })

  it('handles location with only city', () => {
    const listings = parsePage(html)
    const noPrice = listings[1]
    expect(noPrice.city).toBe('Niš')
    expect(noPrice.area).toBeNull()
  })

  it('handles non-numeric price', () => {
    const listings = parsePage(html)
    const noPrice = listings[1]
    expect(noPrice.price).toBeNull()
  })

  it('skips offers without href', () => {
    const badHtml = `
      <div class="row offer">
        <div class="offer-body">
          <h2 class="offer-title"><a>No Link</a></h2>
          <div class="offer-adress">01.01.2026  |  Prodaja  |  Kuća</div>
        </div>
      </div>
    `
    expect(parsePage(badHtml)).toHaveLength(0)
  })

  it('handles 4-part location (area, sub-area, city, country)', () => {
    const locHtml = `
      <div class="row offer">
        <div class="offer-body">
          <h2 class="offer-title">
            <a href="/stambeni-objekti/kuce/test/XYZ999/">House</a>
          </h2>
          <p class="offer-price"><span>100 000 €</span></p>
          <p class="offer-price offer-price--invert"><span>120 m²</span></p>
          <div class="offer-location">Dedinje (RTV Pink), Beograd, Srbija</div>
          <div class="offer-adress">01.01.2026  |  Prodaja  |  Kuća</div>
        </div>
      </div>
    `
    const [listing] = parsePage(locHtml)
    expect(listing.area).toBe('Dedinje (RTV Pink)')
    expect(listing.city).toBe('Beograd')
  })

  it('returns empty for page with no offers', () => {
    expect(parsePage('<div class="empty-page"></div>')).toHaveLength(0)
  })

  it('parses listing with a.offer-title (no wrapping h2)', () => {
    const altHtml = `
      <div class="row offer">
        <div class="offer-body">
          <a class="offer-title" href="/stambeni-objekti/kuce/alt/ALT001/">Alt Title House</a>
          <p class="offer-price"><span>80 000 €</span></p>
          <p class="offer-price offer-price--invert"><span>90 m²</span></p>
          <div class="offer-location">Subotica, Srbija</div>
          <div class="offer-adress">01.01.2026  |  Prodaja  |  Kuća</div>
        </div>
      </div>
    `
    const listings = parsePage(altHtml)
    expect(listings).toHaveLength(1)
    expect(listings[0].title).toBe('Alt Title House')
    expect(listings[0].externalId).toBe('ALT001')
  })
})

describe('hasNextPage', () => {
  it('returns true when page has 20+ offers', () => {
    const offers = Array(20)
      .fill(null)
      .map(
        (_, i) => `
        <div class="row offer">
          <div class="offer-body">
            <h2 class="offer-title"><a href="/test/ID${i}/">T</a></h2>
            <p class="offer-price"><span>100 €</span></p>
            <div class="offer-location">X, Srbija</div>
            <div class="offer-adress">01.01.2026  |  Prodaja  |  K</div>
          </div>
        </div>`
      )
      .join('')
    expect(hasNextPage(offers)).toBe(true)
  })

  it('returns false when page has fewer than 20 offers', () => {
    const offers = Array(5)
      .fill(null)
      .map(
        (_, i) => `
        <div class="row offer">
          <div class="offer-body">
            <h2 class="offer-title"><a href="/test/ID${i}/">T</a></h2>
            <div class="offer-adress">01.01.2026  |  Prodaja  |  K</div>
          </div>
        </div>`
      )
      .join('')
    expect(hasNextPage(offers)).toBe(false)
  })
})
