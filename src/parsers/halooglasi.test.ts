import {
  parsePrice,
  parseSize,
  parseRooms,
  buildSearchUrl,
  parsePage,
} from './halooglasi'

describe('parsePrice', () => {
  it('parses dot-separated thousands', () => {
    expect(parsePrice('449.000')).toBe(449000)
  })

  it('parses price without separator', () => {
    expect(parsePrice('5000')).toBe(5000)
  })

  it('parses large prices', () => {
    expect(parsePrice('1.250.000')).toBe(1250000)
  })

  it('returns null for undefined', () => {
    expect(parsePrice(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parsePrice('')).toBeNull()
  })

  it('returns null for non-numeric', () => {
    expect(parsePrice('Po dogovoru')).toBeNull()
  })
})

describe('parseSize', () => {
  it('extracts m2 from feature text', () => {
    expect(parseSize('256 m2Kvadratura')).toBe(256)
  })

  it('extracts m2 with no space', () => {
    expect(parseSize('55m2Kvadratura')).toBe(55)
  })

  it('returns null for non-matching text', () => {
    expect(parseSize('Kuća Tip nekretnine')).toBeNull()
  })
})

describe('parseRooms', () => {
  it('extracts room count', () => {
    expect(parseRooms('5.0 Broj soba')).toBe(5)
  })

  it('extracts decimal rooms', () => {
    expect(parseRooms('2.5 Broj soba')).toBe(2.5)
  })

  it('returns null for non-matching text', () => {
    expect(parseRooms('256 m2Kvadratura')).toBeNull()
  })
})

describe('buildSearchUrl', () => {
  it('builds URL with keywords and area', () => {
    const url = buildSearchUrl(
      { keywords: 'banatska kuća', area: 'Novi Sad' },
      1
    )
    expect(url).toContain('tekst=banatska+ku%C4%87a+Novi+Sad')
    expect(url).not.toContain('page=')
  })

  it('adds page param for page > 1', () => {
    const url = buildSearchUrl({ keywords: 'kuća', area: '' }, 3)
    expect(url).toContain('page=3')
  })

  it('includes price filters when set', () => {
    const url = buildSearchUrl(
      {
        keywords: 'kuća',
        area: '',
        minPrice: 50000,
        maxPrice: 200000,
      },
      1
    )
    expect(url).toContain('cena_d_from=50000')
    expect(url).toContain('cena_d_to=200000')
  })

  it('includes size and plot filters', () => {
    const url = buildSearchUrl(
      {
        keywords: 'kuća',
        area: '',
        minSize: 80,
        maxSize: 200,
        minPlotSize: 10,
      },
      1
    )
    expect(url).toContain('kvadratura_d_from=80')
    expect(url).toContain('kvadratura_d_to=200')
    expect(url).toContain('povrsina_placa_d_from=10')
  })

  it('omits unset optional filters', () => {
    const url = buildSearchUrl({ keywords: 'kuća', area: '' }, 1)
    expect(url).not.toContain('cena_d')
    expect(url).not.toContain('kvadratura_d')
    expect(url).not.toContain('povrsina_placa_d')
  })
})

describe('parsePage', () => {
  const html = `
    <div class="product-item" data-id="123456">
      <h3 class="product-title">
        <a href="/nekretnine/prodaja-kuca/test-listing/123456?kid=4">Test House</a>
      </h3>
      <div class="central-feature">
        <span data-value="150.000"><i>150.000 €</i></span>
      </div>
      <ul class="subtitle-places">
        <li>Beograd</li>
        <li>Zemun</li>
        <li>Centar</li>
      </ul>
      <ul class="product-features">
        <li><div class="value-wrapper">Kuća Tip nekretnine</div></li>
        <li><div class="value-wrapper">120 m2Kvadratura</div></li>
        <li><div class="value-wrapper">3.0 Broj soba</div></li>
      </ul>
    </div>
    <div class="product-item" data-id="789012">
      <h3 class="product-title">
        <a href="/nekretnine/prodaja-kuca/another/789012?kid=4">No Price House</a>
      </h3>
      <div class="central-feature"></div>
      <ul class="subtitle-places">
        <li>Novi Sad</li>
      </ul>
      <ul class="product-features">
        <li><div class="value-wrapper">Kuća Tip nekretnine</div></li>
      </ul>
    </div>
  `

  it('extracts all listings from HTML', () => {
    const listings = parsePage(html)
    expect(listings).toHaveLength(2)
  })

  it('parses listing fields correctly', () => {
    const [first] = parsePage(html)
    expect(first.externalId).toBe('123456')
    expect(first.source).toBe('halooglasi')
    expect(first.title).toBe('Test House')
    expect(first.url).toBe(
      'https://www.halooglasi.com/nekretnine/prodaja-kuca/test-listing/123456'
    )
    expect(first.price).toBe(150000)
    expect(first.size).toBe(120)
    expect(first.rooms).toBe(3)
    expect(first.city).toBe('Beograd')
    expect(first.area).toBe('Zemun, Centar')
  })

  it('handles missing price', () => {
    const listings = parsePage(html)
    expect(listings[1].price).toBeNull()
  })

  it('handles missing size and rooms', () => {
    const listings = parsePage(html)
    expect(listings[1].size).toBeNull()
    expect(listings[1].rooms).toBeNull()
  })

  it('strips query params from URL', () => {
    const [first] = parsePage(html)
    expect(first.url).not.toContain('?kid=')
  })

  it('skips items without data-id', () => {
    const htmlWithAd = `
      <div class="product-item">
        <h3 class="product-title"><a href="/ad">Ad</a></h3>
      </div>
    `
    expect(parsePage(htmlWithAd)).toHaveLength(0)
  })
})
