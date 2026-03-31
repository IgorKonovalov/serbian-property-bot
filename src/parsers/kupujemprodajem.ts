import axios from 'axios'
import * as cheerio from 'cheerio'
import type { Listing, Parser, SearchParams } from './types'

const BASE_URL =
  'https://www.kupujemprodajem.com/nekretnine-prodaja/kuce/pretraga'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export function buildSearchUrl(params: SearchParams, page: number): string {
  const query = new URLSearchParams()

  query.set('categoryId', '2821')
  query.set('groupId', '2823')

  const keywords = [params.keywords, params.area].filter(Boolean).join(' ')
  if (keywords) query.set('keywords', keywords)

  if (params.minPrice) query.set('priceFrom', String(params.minPrice))
  if (params.maxPrice) query.set('priceTo', String(params.maxPrice))
  query.set('currency', 'eur')

  if (params.minSize) query.set('realEstateAreaFrom', String(params.minSize))
  if (params.maxSize) query.set('realEstateAreaTo', String(params.maxSize))

  if (page > 1) query.set('page', String(page))

  return `${BASE_URL}?${query.toString()}`
}

export function parsePrice(raw: string | undefined): number | null {
  if (!raw) return null
  // Format: "21.000 €" or "295.000 €" (dot as thousands separator)
  const cleaned = raw.replace(/\./g, '').replace(/[^\d]/g, '')
  const num = parseInt(cleaned, 10)
  return isNaN(num) ? null : num
}

export function parseRoomsFromTitle(title: string): number | null {
  // Pattern: "4.0 četvorosobna" or "2.0 dvosobna" or "5+ petosobna"
  const match = title.match(/([\d.]+)\+?\s*(?:[a-zčćšžđ]*sobna)/i)
  if (!match) return null
  const num = parseFloat(match[1])
  return isNaN(num) ? null : num
}

export function parseSizeFromTitle(title: string): number | null {
  // Pattern: "80 m²" or "131m2"
  const match = title.match(/(\d+)\s*m[²2]/i)
  return match ? parseInt(match[1], 10) : null
}

export function parseLocation(raw: string): {
  city: string | null
  area: string | null
} {
  if (!raw) return { city: null, area: null }
  // Format: "Novi Sad | Opština Novi Sad | Futog" or "Beograd | Opština Zvezdara | Mali Mokri Lug"
  const parts = raw.split('|').map((s) => s.trim())
  const city = parts[0] ?? null
  const area = parts.length > 2 ? parts[parts.length - 1] : null
  return { city, area }
}

export function parsePage(html: string): Listing[] {
  const $ = cheerio.load(html)
  const listings: Listing[] = []

  $('article[class*="AdItem_adHolder"]').each((_i, el) => {
    const card = $(el)

    const linkEl = card.find('a[href*="/oglas/"]').first()
    const href = linkEl.attr('href')
    if (!href) return

    const idMatch = href.match(/\/oglas\/(\d+)/)
    const externalId = idMatch?.[1]
    if (!externalId) return

    const url = `https://www.kupujemprodajem.com${href}`

    const title =
      card.find('[class*="AdItem_name"]').first().text().trim() || ''

    const priceRaw = card.find('[class*="AdItem_price"]').first().text().trim()
    const price = parsePrice(priceRaw)

    const locationRaw = card
      .find('[class*="AdItem_originAndPromoLocation"] p')
      .first()
      .text()
      .trim()
    const { city, area } = parseLocation(locationRaw)

    const imageUrl = card.find('img').first().attr('src') ?? null

    const rooms = parseRoomsFromTitle(title)
    const size = parseSizeFromTitle(title)

    listings.push({
      externalId,
      source: 'kupujemprodajem',
      url,
      title,
      price,
      size,
      plotSize: null,
      rooms,
      area,
      city,
      imageUrl,
    })
  })

  return listings
}

export function hasNextPage(html: string, currentPage: number): boolean {
  const $ = cheerio.load(html)
  const nextPageLink = $(`a[href*="page=${currentPage + 1}"]`)
  return nextPageLink.length > 0
}

export class KupujemProdajemParser implements Parser {
  readonly source = 'kupujemprodajem'

  async search(params: SearchParams): Promise<Listing[]> {
    const allListings: Listing[] = []
    const maxPages = 3

    for (let page = 1; page <= maxPages; page++) {
      const url = buildSearchUrl(params, page)

      const response = await axios.get(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html',
          'Accept-Language': 'sr-Latn-RS,sr;q=0.9,en;q=0.8',
        },
        timeout: 15000,
      })

      const listings = parsePage(response.data)
      allListings.push(...listings)

      if (!hasNextPage(response.data, page)) break

      if (page < maxPages) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    return allListings
  }
}
