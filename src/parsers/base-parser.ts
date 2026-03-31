import axios from 'axios'
import type { Listing, SearchParams } from './types'

export const MAX_PAGES = 3
export const REQUEST_TIMEOUT = 15000
export const PAGE_DELAY = 1000

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export const DEFAULT_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'text/html',
  'Accept-Language': 'sr-Latn-RS,sr;q=0.9,en;q=0.8',
}

export async function fetchPage(
  url: string,
  source: string
): Promise<string | null> {
  try {
    const response = await axios.get(url, {
      headers: DEFAULT_HEADERS,
      timeout: REQUEST_TIMEOUT,
    })
    if (response.status !== 200) {
      console.warn(`[${source}] fetchPage: HTTP ${response.status} for ${url}`)
      return null
    }
    return response.data
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      console.warn(
        `[${source}] fetchPage: HTTP ${error.response.status} for ${url}`
      )
    } else {
      console.error(
        `[${source}] fetchPage failed:`,
        error instanceof Error ? error.message : error
      )
    }
    return null
  }
}

export interface PaginatedSearchConfig {
  source: string
  buildUrl(params: SearchParams, page: number): string
  parsePage(html: string): Listing[]
  hasNextPage(html: string, page: number): boolean
}

export async function paginatedSearch(
  config: PaginatedSearchConfig,
  params: SearchParams
): Promise<Listing[]> {
  const allListings: Listing[] = []

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = config.buildUrl(params, page)
    console.log(`[${config.source}] Fetching page ${page}: ${url}`)

    let html: string
    try {
      const start = Date.now()
      const response = await axios.get(url, {
        headers: DEFAULT_HEADERS,
        timeout: REQUEST_TIMEOUT,
      })
      console.log(
        `[${config.source}] Page ${page}: HTTP ${response.status} (${Date.now() - start}ms)`
      )

      if (response.status !== 200) {
        console.warn(
          `[${config.source}] Unexpected status ${response.status}, stopping pagination`
        )
        break
      }

      html = response.data
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const status = error.response.status
        if (status === 429) {
          console.warn(
            `[${config.source}] Rate limited (429), stopping pagination`
          )
        } else {
          console.warn(
            `[${config.source}] HTTP ${status} on page ${page}, stopping pagination`
          )
        }
      } else {
        console.error(
          `[${config.source}] Request failed on page ${page}:`,
          error instanceof Error ? error.message : error
        )
      }
      break
    }

    const listings = config.parsePage(html)
    console.log(
      `[${config.source}] Page ${page}: ${listings.length} listings parsed`
    )
    allListings.push(...listings)

    if (!config.hasNextPage(html, page)) break

    if (page < MAX_PAGES) {
      await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY))
    }
  }

  return allListings
}
