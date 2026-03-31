import * as cheerio from 'cheerio'
import type { Listing, Parser, SearchParams } from './types'
import { paginatedSearch, fetchPage } from './base-parser'
import { cityToSlug } from './utils'

const BASE_URL = 'https://www.oglasi.rs/nekretnine/prodaja-kuca'
const ITEMS_PER_PAGE = 24

function extractExternalId(url: string): string | null {
  const match = url.match(/\/oglas\/([\w-]+)\//)
  return match?.[1] ?? null
}

export function buildSearchUrl(params: SearchParams, page: number): string {
  const pathSegments = [BASE_URL]

  if (params.area) {
    pathSegments.push(cityToSlug(params.area))
  }

  const query = new URLSearchParams()

  if (params.minPrice) query.set('pr[s]', String(params.minPrice))
  if (params.maxPrice) query.set('pr[e]', String(params.maxPrice))
  query.set('pr[c]', 'EUR')
  query.set('s', 'd') // newest first

  // minSize/maxSize — site uses predefined buckets, skip and post-filter
  // minPlotSize — same bucket system, skip and post-filter
  // keywords — robots.txt blocks keyword search, skip silently

  if (page > 1) query.set('p', String(page))

  return `${pathSegments.join('/')}?${query.toString()}`
}

export function parsePage(html: string): Listing[] {
  const $ = cheerio.load(html)
  const listings: Listing[] = []

  $('article[itemtype="http://schema.org/Product"], article[itemscope]').each(
    (_i, el) => {
      const card = $(el)

      const linkEl = card.find('a.fpogl-list-title, a[href*="/oglas/"]').first()
      const href = linkEl.attr('href')
      if (!href) return

      const url = href.startsWith('http')
        ? href
        : `https://www.oglasi.rs${href}`
      const externalId = extractExternalId(url)
      if (!externalId) return

      const title = card
        .find('h2[itemprop="name"], .fpogl-list-title')
        .first()
        .text()
        .trim()

      // Price from Schema.org microdata
      const priceAttr = card
        .find('span[itemprop="price"], [itemprop="price"]')
        .attr('content')
      const price = priceAttr ? parseFloat(priceAttr) : null
      const validPrice =
        price !== null && !isNaN(price) ? Math.round(price) : null

      // Size from card text
      const cardText = card.text()
      const sizeMatch =
        cardText.match(/Kvadratura[:\s]*(\d+)\s*m2/i) ??
        cardText.match(/(\d+)\s*m2/i)
      const size = sizeMatch ? parseInt(sizeMatch[1], 10) : null

      // Plot size: m² → ares (÷100)
      const plotMatch = cardText.match(/Površina zemljišta[:\s]*(\d+)\s*m2/i)
      const plotSize = plotMatch
        ? Math.round(parseInt(plotMatch[1], 10) / 100)
        : null

      // Rooms
      const roomsMatch = cardText.match(/Broj soba[:\s]*([\d.,]+)/i)
      const rooms = roomsMatch
        ? parseFloat(roomsMatch[1].replace(',', '.'))
        : null
      const validRooms = rooms !== null && !isNaN(rooms) ? rooms : null

      // Location from breadcrumbs or card location elements
      const locationParts = card
        .find('.fpogl-list-location, [class*="location"]')
        .first()
        .text()
        .split(/[,>]/)
        .map((s) => s.trim())
        .filter(Boolean)
      const city = locationParts[0] ?? null
      const area =
        locationParts.length > 1 ? locationParts.slice(1).join(', ') : null

      const imageUrl =
        card
          .find('a.fpogl-list-image img, img[itemprop="image"]')
          .attr('src') ?? null

      listings.push({
        externalId,
        source: 'oglasi',
        url,
        title,
        price: validPrice,
        size,
        plotSize,
        rooms: validRooms,
        area,
        city,
        imageUrl,
      })
    }
  )

  return listings
}

export function hasNextPage(html: string, currentPage: number): boolean {
  const $ = cheerio.load(html)
  // Check for a link to the next page in pagination
  const hasLink = $(`.pagination a[href*="p=${currentPage + 1}"]`).length > 0
  if (hasLink) return true

  // Fallback: full page means there might be more
  return (
    $('article[itemtype="http://schema.org/Product"], article[itemscope]')
      .length >= ITEMS_PER_PAGE
  )
}

export function parseDetailPage(html: string, url: string): Listing | null {
  const $ = cheerio.load(html)

  const externalId = extractExternalId(url)
  if (!externalId) return null

  const title = $('h1').first().text().trim()

  const priceAttr = $('[itemprop="price"]').attr('content')
  const priceNum = priceAttr ? parseFloat(priceAttr) : null
  const price =
    priceNum !== null && !isNaN(priceNum) ? Math.round(priceNum) : null

  const bodyText = $(
    '[class*="detail"], [class*="description"], .oglas-detail'
  ).text()

  const sizeMatch =
    bodyText.match(/Kvadratura[:\s]*(\d+)\s*m2/i) ??
    bodyText.match(/(\d+)\s*m2/i)
  const size = sizeMatch ? parseInt(sizeMatch[1], 10) : null

  const plotMatch = bodyText.match(/Površina zemljišta[:\s]*(\d+)\s*m2/i)
  const plotSize = plotMatch
    ? Math.round(parseInt(plotMatch[1], 10) / 100)
    : null

  const roomsMatch = bodyText.match(/Broj soba[:\s]*([\d.,]+)/i)
  const roomsNum = roomsMatch
    ? parseFloat(roomsMatch[1].replace(',', '.'))
    : null
  const rooms = roomsNum !== null && !isNaN(roomsNum) ? roomsNum : null

  const locationParts = $('.oglas-location, [class*="location"]')
    .first()
    .text()
    .split(/[,>]/)
    .map((s) => s.trim())
    .filter(Boolean)
  const city = locationParts[0] ?? null
  const area =
    locationParts.length > 1 ? locationParts.slice(1).join(', ') : null

  const imageUrl = $('meta[property="og:image"]').attr('content') ?? null

  return {
    externalId,
    source: 'oglasi',
    url,
    title,
    price,
    size,
    plotSize,
    rooms,
    area,
    city,
    imageUrl,
  }
}

export class OglasiParser implements Parser {
  readonly source = 'oglasi'

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
