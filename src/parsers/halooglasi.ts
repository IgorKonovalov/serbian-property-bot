import * as cheerio from 'cheerio'
import type { Listing, Parser, SearchParams } from './types'
import { paginatedSearch, fetchPage } from './base-parser'
import {
  parsePrice as sharedParsePrice,
  parseSize as sharedParseSize,
  parseRooms as sharedParseRooms,
} from './parse-helpers'

const BASE_URL = 'https://www.halooglasi.com/nekretnine/prodaja-kuca'

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

export const parsePrice = sharedParsePrice
export const parseSize = sharedParseSize
export const parseRooms = sharedParseRooms

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

export function hasNextPage(html: string, currentPage: number): boolean {
  const $ = cheerio.load(html)
  const nextLink = $(`.pagination a[href*="page=${currentPage + 1}"]`)
  return nextLink.length > 0
}

export function parseDetailPage(html: string, url: string): Listing | null {
  const $ = cheerio.load(html)

  const externalId =
    url.match(/\/(\d+)(?:\?|$)/)?.[1] ??
    $('meta[property="og:url"]')
      .attr('content')
      ?.match(/\/(\d+)/)?.[1]
  if (!externalId) return null

  const title = $('h1.detail-title').text().trim() || ''
  const priceRaw =
    $('.central-feature__price .central-feature__value').text().trim() ||
    $('[data-field-name="cena_d"]').text().trim()
  const price = parsePrice(priceRaw)

  const locationParts = $('.product-location .product-location-value')
    .map(function () {
      return $(this).text().trim()
    })
    .get()
    .filter(Boolean)
  const city = locationParts[0] ?? null
  const area = locationParts.slice(1).join(', ') || null

  const imageUrl = $('meta[property="og:image"]').attr('content') ?? null

  const featuresText = $('.detail-features-list').text()
  const size = parseSize(featuresText)
  const rooms = parseRooms(featuresText)

  return {
    externalId,
    source: 'halooglasi',
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

export class HalooglasiParser implements Parser {
  readonly source = 'halooglasi'

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
