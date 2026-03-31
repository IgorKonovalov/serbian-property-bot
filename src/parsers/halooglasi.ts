import axios from 'axios'
import * as cheerio from 'cheerio'
import type { Listing, Parser, SearchParams } from './types'

const BASE_URL = 'https://www.halooglasi.com/nekretnine/prodaja-kuca'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export function buildSearchUrl(params: SearchParams, page: number): string {
  const query = new URLSearchParams()

  const tekst = [params.keywords, params.area].filter(Boolean).join(' ')
  query.set('tekst', tekst)

  if (params.minPrice) query.set('cena_d_from', String(params.minPrice))
  if (params.maxPrice) query.set('cena_d_to', String(params.maxPrice))
  if (params.minSize) query.set('kvadratura_d_from', String(params.minSize))
  if (params.maxSize) query.set('kvadratura_d_to', String(params.maxSize))
  if (params.minPlotSize)
    query.set('povrsina_placa_d_from', String(params.minPlotSize))

  if (page > 1) query.set('page', String(page))

  return `${BASE_URL}?${query.toString()}`
}

export function parsePrice(raw: string | undefined): number | null {
  if (!raw) return null
  // Format: "449.000" (dot as thousands separator)
  const cleaned = raw.replace(/\./g, '').replace(/,/g, '').trim()
  const num = parseInt(cleaned, 10)
  return isNaN(num) ? null : num
}

export function parseSize(featureText: string): number | null {
  const match = featureText.match(/(\d+)\s*m2/i)
  return match ? parseInt(match[1], 10) : null
}

export function parseRooms(featureText: string): number | null {
  const match = featureText.match(/([\d.]+)\s*Broj soba/i)
  if (!match) return null
  const num = parseFloat(match[1])
  return isNaN(num) ? null : num
}

export function parsePage(html: string): Listing[] {
  const $ = cheerio.load(html)
  const listings: Listing[] = []

  $('.product-item[data-id]').each((_i, el) => {
    const item = $(el)
    const externalId = item.attr('data-id')
    if (!externalId) return

    const titleEl = item.find('.product-title a')
    const title = titleEl.text().trim()
    const relativeUrl = titleEl.attr('href')
    if (!relativeUrl) return

    // Strip query params from URL for cleaner storage
    const url = `https://www.halooglasi.com${relativeUrl.split('?')[0]}`

    const priceRaw = item
      .find('.central-feature span[data-value]')
      .attr('data-value')
    const price = parsePrice(priceRaw)

    const locations = item
      .find('.subtitle-places li')
      .map(function () {
        return $(this).text().trim()
      })
      .get()
      .filter(Boolean)

    const city = locations[0] ?? null
    const area = locations.slice(1).join(', ') || null

    const imageUrl = item.find('.pi-img-wrapper img').attr('src') ?? null

    const features = item
      .find('.product-features li .value-wrapper')
      .map(function () {
        return $(this).text().trim()
      })
      .get()

    let size: number | null = null
    let rooms: number | null = null

    for (const f of features) {
      if (size === null) size = parseSize(f)
      if (rooms === null) rooms = parseRooms(f)
    }

    listings.push({
      externalId,
      source: 'halooglasi',
      url,
      title,
      price,
      size,
      plotSize: null, // not shown in listing cards
      rooms,
      area,
      city,
      imageUrl,
    })
  })

  return listings
}

function hasNextPage(html: string, currentPage: number): boolean {
  const $ = cheerio.load(html)
  const nextLink = $(`.pagination a[href*="page=${currentPage + 1}"]`)
  return nextLink.length > 0
}

export class HalooglasiParser implements Parser {
  readonly source = 'halooglasi'

  async search(params: SearchParams): Promise<Listing[]> {
    const allListings: Listing[] = []
    const maxPages = 3 // limit to avoid excessive requests

    for (let page = 1; page <= maxPages; page++) {
      const url = buildSearchUrl(params, page)
      console.log(`[halooglasi] Fetching page ${page}: ${url}`)

      const start = Date.now()
      const response = await axios.get(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html',
          'Accept-Language': 'sr-Latn-RS,sr;q=0.9,en;q=0.8',
        },
        timeout: 15000,
      })
      console.log(
        `[halooglasi] Page ${page}: HTTP ${response.status} (${Date.now() - start}ms)`
      )

      const listings = parsePage(response.data)
      console.log(
        `[halooglasi] Page ${page}: ${listings.length} listings parsed`
      )
      allListings.push(...listings)

      if (!hasNextPage(response.data, page)) break

      // Delay between pages to be polite
      if (page < maxPages) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    return allListings
  }
}
