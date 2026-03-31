import {
  parsePrice,
  parseRoomsFromTitle,
  parseSizeFromTitle,
  parseLocation,
  buildSearchUrl,
  parsePage,
  hasNextPage,
} from './kupujemprodajem'

describe('parsePrice', () => {
  it('parses dot-separated thousands with euro sign', () => {
    expect(parsePrice('21.000 €')).toBe(21000)
  })

  it('parses large prices', () => {
    expect(parsePrice('1.250.000 €')).toBe(1250000)
  })

  it('parses price without separator', () => {
    expect(parsePrice('5000 €')).toBe(5000)
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

describe('parseRoomsFromTitle', () => {
  it('extracts rooms from standard format', () => {
    expect(parseRoomsFromTitle('Futog, 4.0 četvorosobna, 61 m²')).toBe(4)
  })

  it('extracts rooms with 2.0 dvosobna', () => {
    expect(
      parseRoomsFromTitle('Dinka Šimunoviča, Blok Vila, 2.0 dvosobna, 68 m²')
    ).toBe(2)
  })

  it('extracts 5+ petosobna', () => {
    expect(
      parseRoomsFromTitle(
        'Narodnog Fronta, Mali Mokri Lug, 5+ petosobna, 190 m²'
      )
    ).toBe(5)
  })

  it('extracts 3.0 trosobna', () => {
    expect(parseRoomsFromTitle('Sadovi, 3.0 trosobna, 81 m²')).toBe(3)
  })

  it('returns null for freeform title without room info', () => {
    expect(parseRoomsFromTitle('Novi Slankamen kuća 131m2, HITNO!')).toBeNull()
  })
})

describe('parseSizeFromTitle', () => {
  it('extracts m² from standard format', () => {
    expect(parseSizeFromTitle('Futog, 4.0 četvorosobna, 61 m²')).toBe(61)
  })

  it('extracts m2 without space', () => {
    expect(parseSizeFromTitle('Novi Slankamen kuća 131m2, HITNO!')).toBe(131)
  })

  it('extracts large size', () => {
    expect(parseSizeFromTitle('5+ petosobna, 300 m²')).toBe(300)
  })

  it('returns null for title without size', () => {
    expect(parseSizeFromTitle('Prodajem kuću u centru')).toBeNull()
  })
})

describe('parseLocation', () => {
  it('parses full city | municipality | area format', () => {
    const result = parseLocation('Novi Sad | Opština Novi Sad | Futog')
    expect(result.city).toBe('Novi Sad')
    expect(result.area).toBe('Futog')
  })

  it('parses city-only location', () => {
    const result = parseLocation('Novi Sad')
    expect(result.city).toBe('Novi Sad')
    expect(result.area).toBeNull()
  })

  it('handles empty string', () => {
    const result = parseLocation('')
    expect(result.city).toBeNull()
    expect(result.area).toBeNull()
  })

  it('parses two-part location', () => {
    const result = parseLocation('Beograd | Opština Zvezdara')
    expect(result.city).toBe('Beograd')
    expect(result.area).toBeNull()
  })
})

describe('buildSearchUrl', () => {
  it('builds URL with keywords and area', () => {
    const url = buildSearchUrl({ keywords: 'kuća', area: 'Novi Sad' }, 1)
    expect(url).toContain('categoryId=2821')
    expect(url).toContain('groupId=2823')
    expect(url).toContain('keywords=ku%C4%87a+Novi+Sad')
    expect(url).toContain('currency=eur')
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
    expect(url).toContain('priceFrom=50000')
    expect(url).toContain('priceTo=200000')
  })

  it('includes size filters when set', () => {
    const url = buildSearchUrl(
      {
        keywords: 'kuća',
        area: '',
        minSize: 80,
        maxSize: 200,
      },
      1
    )
    expect(url).toContain('realEstateAreaFrom=80')
    expect(url).toContain('realEstateAreaTo=200')
  })

  it('omits unset optional filters', () => {
    const url = buildSearchUrl({ keywords: 'kuća', area: '' }, 1)
    expect(url).not.toContain('priceFrom')
    expect(url).not.toContain('priceTo')
    expect(url).not.toContain('realEstateArea')
  })
})

describe('parsePage', () => {
  const html = `
    <article class="AdItem_adHolder__rKT82">
      <a href="/nekretnine-prodaja/kuce/futog-4-0-cetvorosobna-61-m/oglas/190614962">
        <div class="AdItem_imageHolder__ropiU">
          <img src="https://images.kupujemprodajem.com/photos/oglasi/test.webp" width="144" height="144" alt="Futog">
        </div>
      </a>
      <div class="AdItem_descriptionHolder__La9qE">
        <div class="AdItem_adInfoHolder__Vljfb">
          <a href="/nekretnine-prodaja/kuce/futog-4-0-cetvorosobna-61-m/oglas/190614962">
            <div class="AdItem_name__iOZvA">Futog, 4.0 četvorosobna, 61 m²</div>
          </a>
          <div class="AdItem_originAndPromoLocation__rQvKl">
            <p>Novi Sad | Opština Novi Sad | Futog</p>
          </div>
          <div class="AdItem_priceHolder__yVMOe">
            <div>
              <div class="AdItem_price__VZ_at"><div>155.000 €</div></div>
            </div>
          </div>
        </div>
      </div>
    </article>
    <article class="AdItem_adHolder__abc123">
      <a href="/nekretnine-prodaja/kuce/novi-slankamen-kuca-131m2/oglas/189217942">
        <div class="AdItem_imageHolder__xyz">
          <img src="https://images.kupujemprodajem.com/photos/oglasi/test2.webp" width="144" height="144" alt="Test">
        </div>
      </a>
      <div class="AdItem_descriptionHolder__xyz">
        <div class="AdItem_adInfoHolder__xyz">
          <a href="/nekretnine-prodaja/kuce/novi-slankamen-kuca-131m2/oglas/189217942">
            <div class="AdItem_name__xyz">Novi Slankamen kuća 131m2, HITNO!</div>
          </a>
          <div class="AdItem_originAndPromoLocation__xyz">
            <p>Novi Sad</p>
          </div>
          <div class="AdItem_priceHolder__xyz">
            <div>
              <div class="AdItem_price__xyz"><div>88.000 €</div></div>
            </div>
          </div>
        </div>
      </div>
    </article>
  `

  it('extracts all listings from HTML', () => {
    const listings = parsePage(html)
    expect(listings).toHaveLength(2)
  })

  it('parses listing fields correctly', () => {
    const [first] = parsePage(html)
    expect(first.externalId).toBe('190614962')
    expect(first.source).toBe('kupujemprodajem')
    expect(first.title).toBe('Futog, 4.0 četvorosobna, 61 m²')
    expect(first.url).toBe(
      'https://www.kupujemprodajem.com/nekretnine-prodaja/kuce/futog-4-0-cetvorosobna-61-m/oglas/190614962'
    )
    expect(first.price).toBe(155000)
    expect(first.size).toBe(61)
    expect(first.rooms).toBe(4)
    expect(first.city).toBe('Novi Sad')
    expect(first.area).toBe('Futog')
    expect(first.imageUrl).toBe(
      'https://images.kupujemprodajem.com/photos/oglasi/test.webp'
    )
  })

  it('handles freeform title without structured room/size', () => {
    const listings = parsePage(html)
    expect(listings[1].title).toBe('Novi Slankamen kuća 131m2, HITNO!')
    expect(listings[1].size).toBe(131)
    expect(listings[1].rooms).toBeNull()
  })

  it('handles city-only location', () => {
    const listings = parsePage(html)
    expect(listings[1].city).toBe('Novi Sad')
    expect(listings[1].area).toBeNull()
  })

  it('works with different CSS module hashes', () => {
    // Second card has different hash suffixes — should still parse
    const listings = parsePage(html)
    expect(listings[1].externalId).toBe('189217942')
    expect(listings[1].price).toBe(88000)
  })

  it('skips cards without oglas link', () => {
    const noLinkHtml = `
      <article class="AdItem_adHolder__abc">
        <a href="/some-other-page">
          <div class="AdItem_name__abc">Not a listing</div>
        </a>
      </article>
    `
    expect(parsePage(noLinkHtml)).toHaveLength(0)
  })

  it('returns empty array for page with no listings', () => {
    expect(parsePage('<div>No results</div>')).toHaveLength(0)
  })
})

describe('hasNextPage', () => {
  it('returns true when next page link exists', () => {
    const html = `
      <div class="Pagination_holder__abc">
        <a href="/kuce/pretraga?page=1">1</a>
        <a href="/kuce/pretraga?page=2">2</a>
        <a href="/kuce/pretraga?page=3">3</a>
      </div>
    `
    expect(hasNextPage(html, 1)).toBe(true)
  })

  it('returns false when on last page', () => {
    const html = `
      <div class="Pagination_holder__abc">
        <a href="/kuce/pretraga?page=1">1</a>
        <a href="/kuce/pretraga?page=2">2</a>
        <a href="/kuce/pretraga?page=3">3</a>
      </div>
    `
    expect(hasNextPage(html, 3)).toBe(false)
  })

  it('returns false when no pagination exists', () => {
    expect(hasNextPage('<div>Single page</div>', 1)).toBe(false)
  })
})
