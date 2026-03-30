import axios from 'axios'
import * as cheerio from 'cheerio'
import type { Listing, Parser, SearchParams } from './types'

const BASE_URL = 'https://www.nekretnine.rs/stambeni-objekti/kuce'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export function cityToSlug(city: string): string {
  return city
    .toLowerCase()
    .replace(/č/g, 'c')
    .replace(/ć/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/đ/g, 'dj')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function buildSearchUrl(params: SearchParams, page: number): string {
  const segments: string[] = [BASE_URL, 'prodaja']

  if (params.area) {
    segments.push(`grad/${cityToSlug(params.area)}`)
  }

  if (params.minPrice || params.maxPrice) {
    const from = params.minPrice ?? 1
    const to = params.maxPrice ?? 10000000
    segments.push(`cena/${from}_${to}`)
  }

  if (params.minSize || params.maxSize) {
    const from = params.minSize ?? 1
    const to = params.maxSize ?? 10000
    segments.push(`kvadratura/${from}_${to}`)
  }

  segments.push('lista/po-stranici/20')

  if (page > 1) {
    segments.push(`stranica/${page}`)
  }

  return segments.join('/') + '/'
}

export function parsePrice(text: string | undefined): number | null {
  if (!text) return null
  const cleaned = text.replace(/[^\d]/g, '')
  const num = parseInt(cleaned, 10)
  return isNaN(num) ? null : num
}

export function parseSize(text: string | undefined): number | null {
  if (!text) return null
  const match = text.match(/([\d,.]+)\s*m²/i)
  if (!match) return null
  const num = parseFloat(match[1].replace(',', '.'))
  return isNaN(num) ? null : Math.round(num)
}

export function parsePage(html: string): Listing[] {
  const $ = cheerio.load(html)
  const listings: Listing[] = []

  $('.offer-body').each((_i, el) => {
    const item = $(el)
    const titleEl = item.find('.offer-title a').first()
    if (!titleEl.length) {
      const altTitle = item.find('a.offer-title').first()
      if (!altTitle.length) return
    }

    const linkEl = item.find('.offer-title a, a.offer-title').first()
    const title = linkEl.text().trim()
    const relativeUrl = linkEl.attr('href')
    if (!relativeUrl) return

    const idMatch = relativeUrl.match(/\/([A-Za-z0-9_-]+)\/$/)
    const externalId = idMatch?.[1]
    if (!externalId) return

    const url = `https://www.nekretnine.rs${relativeUrl}`

    const priceRaw = item
      .find('.offer-price')
      .first()
      .text()
      .trim()
      .split('\n')[0]
      ?.trim()
    const price = parsePrice(priceRaw)

    const sizeRaw = item
      .find('.offer-price--invert')
      .first()
      .text()
      .trim()
      .split('\n')[0]
      ?.trim()
    const size = parseSize(sizeRaw)

    const locationText = item.find('.offer-location').text().trim()
    const locationParts = locationText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    // Location format: "Area, City, Country" or "City, Country"
    const area = locationParts.length > 2 ? locationParts[0] : null
    const city =
      locationParts.length > 2 ? locationParts[1] : (locationParts[0] ?? null)

    // Meta has date, type (Prodaja/Izdavanje), property type
    const meta = item.find('.offer-adress').text().trim()
    // Skip rentals (Izdavanje)
    if (meta.includes('Izdavanje')) return

    // Image is in parent .offer row, not inside .offer-body
    const offerRow = item.closest('.offer')
    const imageUrl = offerRow.find('img.img-fluid').attr('src') ?? null

    listings.push({
      externalId,
      source: 'nekretnine',
      url,
      title,
      price,
      size,
      plotSize: null,
      rooms: null, // not shown in listing cards
      area,
      city,
      imageUrl,
    })
  })

  return listings
}

export function hasNextPage(html: string): boolean {
  const $ = cheerio.load(html)
  return $('.offer-body').length >= 20
}

export class NekretnineParser implements Parser {
  readonly source = 'nekretnine'

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

      if (!hasNextPage(response.data)) break

      if (page < maxPages) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    return allListings
  }
}
