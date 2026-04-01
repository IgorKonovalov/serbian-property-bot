import * as cheerio from 'cheerio'
import type { Listing, Parser, SearchParams } from './types'
import { paginatedSearch, fetchPage } from './base-parser'
import {
  parsePrice as sharedParsePrice,
  parseSize as sharedParseSize,
  parseRooms as sharedParseRooms,
} from './parse-helpers'

const BASE_URL =
  'https://www.kupujemprodajem.com/nekretnine-prodaja/kuce/pretraga'

export function buildSearchUrl(params: SearchParams, page: number): string {
  const query = new URLSearchParams()

  query.set('categoryId', '2821')
  query.set('groupId', '2823')

  if (params.keywords) query.set('keywords', params.keywords)
  if (params.area) query.set('realEstateLocation', params.area)

  if (params.minPrice) query.set('priceFrom', String(params.minPrice))
  if (params.maxPrice) query.set('priceTo', String(params.maxPrice))
  query.set('currency', 'eur')

  if (params.minSize) query.set('realEstateAreaFrom', String(params.minSize))
  if (params.maxSize) query.set('realEstateAreaTo', String(params.maxSize))

  if (page > 1) query.set('page', String(page))

  return `${BASE_URL}?${query.toString()}`
}

export const parsePrice = sharedParsePrice
export const parseRoomsFromTitle = sharedParseRooms
export const parseSizeFromTitle = sharedParseSize

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

export function parseDetailPage(html: string, url: string): Listing | null {
  const $ = cheerio.load(html)

  const idMatch = url.match(/\/oglas\/(\d+)/)
  const externalId = idMatch?.[1]
  if (!externalId) return null

  const title = $('h1').first().text().trim() || ''

  // Try JSON-LD first for structured data
  let price: number | null = null
  let size: number | null = null
  const jsonLd = $('script[type="application/ld+json"]').first().html()
  if (jsonLd) {
    try {
      const data = JSON.parse(jsonLd)
      if (data.offers?.price) {
        price = parseInt(data.offers.price, 10)
        if (isNaN(price)) price = null
      }
      if (data.floorSize?.value) {
        size = parseInt(data.floorSize.value, 10)
        if (isNaN(size)) size = null
      }
    } catch (error) {
      // JSON-LD parsing failed, fall through to HTML parsing
      if (process.env.NODE_ENV !== 'test') {
        console.warn(`[kp] JSON-LD parse failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  // Fallback to HTML parsing
  if (price === null) {
    const priceRaw = $('[class*="Price"]').first().text().trim()
    price = parsePrice(priceRaw)
  }
  if (size === null && title) {
    size = parseSizeFromTitle(title)
  }

  const locationRaw =
    $('[class*="LocationBreadcrumbs"]').text().trim() ||
    $('meta[property="og:locality"]').attr('content') ||
    ''
  const { city, area } = parseLocation(locationRaw)

  const imageUrl = $('meta[property="og:image"]').attr('content') ?? null
  const rooms = title ? parseRoomsFromTitle(title) : null

  return {
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
  }
}

export class KupujemProdajemParser implements Parser {
  readonly source = 'kupujemprodajem'

  async search(params: SearchParams): Promise<Listing[]> {
    return paginatedSearch(
      {
        source: this.source,
        buildUrl: buildSearchUrl,
        parsePage,
        hasNextPage,
      },
      params
    )
  }

  async fetchByUrl(url: string): Promise<Listing | null> {
    const html = await fetchPage(url, this.source)
    if (!html) return null
    return parseDetailPage(html, url)
  }
}
