import * as cheerio from 'cheerio'
import type { Listing, Parser, SearchParams } from './types'
import { paginatedSearch, fetchPage } from './base-parser'
import { cityToSlug } from './utils'
import { createLogger } from '../logger'

const logger = createLogger('4zida')

const BASE_URL = 'https://www.4zida.rs/prodaja-kuca'
const ITEMS_PER_PAGE = 20

interface JsonLdItem {
  url?: string
  name?: string
  offers?: { price?: number; priceCurrency?: string }
  itemOffered?: {
    floorSize?: { value?: number }
    numberOfRooms?: number
  }
  image?: { url?: string } | string
}

function extractExternalId(url: string): string | null {
  const match = url.match(/\/([a-f0-9]{24})$/)
  return match?.[1] ?? null
}

function getImageUrl(image: JsonLdItem['image']): string | null {
  if (!image) return null
  if (typeof image === 'string') return image
  return image.url ?? null
}

export function buildSearchUrl(params: SearchParams, page: number): string {
  const pathSegments = [BASE_URL]

  if (params.area) {
    pathSegments.push(cityToSlug(params.area))
  }

  const query = new URLSearchParams()

  if (params.minPrice) query.set('skuplje-od', String(params.minPrice))
  if (params.maxPrice) query.set('jeftinije-od', String(params.maxPrice))
  if (params.minSize) query.set('kvadratura-veca-od', String(params.minSize))
  if (params.maxSize) query.set('kvadratura-manja-od', String(params.maxSize))
  // minPlotSize — not supported by 4zida, skip silently
  // keywords — not supported by 4zida, skip silently

  if (page > 1) query.set('strana', String(page))

  const qs = query.toString()
  return qs ? `${pathSegments.join('/')}?${qs}` : pathSegments.join('/')
}

function parseLocationFromUrl(url: string): {
  area: string | null
  city: string | null
} {
  // URL: /prodaja-kuca/{location-parts}/{id}
  const pathMatch = url.match(/\/prodaja-kuca\/(.+)\/[a-f0-9]{24}$/)
  if (!pathMatch) return { area: null, city: null }

  const slugParts = pathMatch[1].split('/')
  // First slug is typically city, rest is area
  const city = slugParts[0]?.replace(/-/g, ' ') ?? null
  const area =
    slugParts.length > 1
      ? slugParts
          .slice(1)
          .map((s) => s.replace(/-/g, ' '))
          .join(', ')
      : null

  return { area, city }
}

export function parseJsonLd(html: string): Listing[] {
  const $ = cheerio.load(html)
  const listings: Listing[] = []

  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      const data = JSON.parse($(el).html() || '{}')
      if (data['@type'] !== 'ItemList' || !Array.isArray(data.itemListElement))
        return

      for (const element of data.itemListElement) {
        const item: JsonLdItem = element.item ?? element
        if (!item.url) continue

        const externalId = extractExternalId(item.url)
        if (!externalId) continue

        const { area, city } = parseLocationFromUrl(item.url)

        listings.push({
          externalId,
          source: '4zida',
          url: item.url,
          title: item.name ?? '',
          price: item.offers?.price ?? null,
          size: item.itemOffered?.floorSize?.value ?? null,
          plotSize: null, // not in JSON-LD
          rooms: item.itemOffered?.numberOfRooms ?? null,
          area,
          city,
          imageUrl: getImageUrl(item.image),
        })
      }
    } catch (error) {
      // malformed JSON-LD, skip — log for monitoring
      if (process.env.NODE_ENV !== 'test') {
        logger.warn('Malformed JSON-LD', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  })

  return listings
}

export function parseHtmlCards(html: string): Listing[] {
  const $ = cheerio.load(html)
  const listings: Listing[] = []

  $('[data-test="ad-search-card"], [test-data="ad-search-card"]').each(
    (_i, el) => {
      const card = $(el)
      const linkEl = card.find('a[href*="/prodaja-kuca/"]').first()
      const href = linkEl.attr('href')
      if (!href) return

      const url = href.startsWith('http') ? href : `https://www.4zida.rs${href}`
      const externalId = extractExternalId(url)
      if (!externalId) return

      const title = card.find('h2, h3, [class*="title"]').first().text().trim()

      const priceText = card.find('[class*="price"]').first().text().trim()
      const priceMatch = priceText.replace(/\./g, '').match(/(\d+)/)
      const price = priceMatch ? parseInt(priceMatch[1], 10) : null

      const sizeText = card.text()
      const sizeMatch = sizeText.match(/(\d+)\s*m[²2]/i)
      const size = sizeMatch ? parseInt(sizeMatch[1], 10) : null

      const { area, city } = parseLocationFromUrl(url)

      const imageUrl = card.find('img').attr('src') ?? null

      listings.push({
        externalId,
        source: '4zida',
        url,
        title,
        price,
        size,
        plotSize: null,
        rooms: null,
        area,
        city,
        imageUrl,
      })
    }
  )

  return listings
}

export function parsePage(html: string): Listing[] {
  const jsonLdListings = parseJsonLd(html)
  if (jsonLdListings.length > 0) return jsonLdListings
  return parseHtmlCards(html)
}

export function hasNextPage(html: string, currentPage: number): boolean {
  const $ = cheerio.load(html)
  // Check for a link to the next page
  const hasLink = $(`a[href*="strana=${currentPage + 1}"]`).length > 0
  if (hasLink) return true

  // Fallback: if current page is full (20 items), assume there's a next page
  const jsonLdListings = parseJsonLd(html)
  if (jsonLdListings.length >= ITEMS_PER_PAGE) return true

  return parseHtmlCards(html).length >= ITEMS_PER_PAGE
}

export function parseDetailPage(html: string, url: string): Listing | null {
  const $ = cheerio.load(html)

  const externalId = extractExternalId(url)
  if (!externalId) return null

  // Try JSON-LD on detail page
  let title = ''
  let price: number | null = null
  let size: number | null = null
  let rooms: number | null = null
  let imageUrl: string | null = null

  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      const data = JSON.parse($(el).html() || '{}')
      if (
        data['@type'] === 'SingleFamilyResidence' ||
        data['@type'] === 'Product' ||
        data['@type'] === 'RealEstateListing'
      ) {
        title = data.name ?? ''
        price = data.offers?.price ?? null
        size = data.floorSize?.value ?? null
        rooms = data.numberOfRooms ?? null
        imageUrl =
          typeof data.image === 'string'
            ? data.image
            : (data.image?.url ?? null)
      }
    } catch (error) {
      // malformed JSON-LD in detail page, skip
      if (process.env.NODE_ENV !== 'test') {
        logger.warn('Malformed detail JSON-LD', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  })

  // Fallback to HTML
  if (!title) {
    title = $('h1').first().text().trim()
  }
  if (price === null) {
    const priceText = $('[class*="price"]').first().text().replace(/\./g, '')
    const priceMatch = priceText.match(/(\d+)/)
    price = priceMatch ? parseInt(priceMatch[1], 10) : null
  }
  if (imageUrl === null) {
    imageUrl = $('meta[property="og:image"]').attr('content') ?? null
  }

  const { area, city } = parseLocationFromUrl(url)

  return {
    externalId,
    source: '4zida',
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

export class FourZidaParser implements Parser {
  readonly source = '4zida'

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
