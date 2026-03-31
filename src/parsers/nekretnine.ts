import * as cheerio from 'cheerio'
import type { Listing, Parser, SearchParams } from './types'
import { paginatedSearch, fetchPage } from './base-parser'

const BASE_URL = 'https://www.nekretnine.rs/stambeni-objekti/kuce'

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

export function parseDetailPage(html: string, url: string): Listing | null {
  const $ = cheerio.load(html)

  const idMatch = url.match(/\/([A-Za-z0-9_-]+)\/$/)
  const externalId = idMatch?.[1]
  if (!externalId) return null

  const title = $('h1').first().text().trim() || ''
  const priceRaw =
    $('.stickyBox__price').first().text().trim() ||
    $('.detail-price').first().text().trim()
  const price = parsePrice(priceRaw)

  const sizeRaw =
    $('.stickyBox__size').first().text().trim() ||
    $('.detail-size').first().text().trim()
  const size = parseSize(sizeRaw)

  const locationText = $('.property__location').text().trim()
  const locationParts = locationText
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const area = locationParts.length > 2 ? locationParts[0] : null
  const city =
    locationParts.length > 2 ? locationParts[1] : (locationParts[0] ?? null)

  const imageUrl = $('meta[property="og:image"]').attr('content') ?? null

  return {
    externalId,
    source: 'nekretnine',
    url,
    title,
    price,
    size,
    plotSize: null,
    rooms: null,
    area,
    city,
    imageUrl,
  }
}

export class NekretnineParser implements Parser {
  readonly source = 'nekretnine'

  async search(params: SearchParams): Promise<Listing[]> {
    return paginatedSearch(
      {
        source: this.source,
        buildUrl: buildSearchUrl,
        parsePage,
        hasNextPage: (html) => hasNextPage(html),
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
