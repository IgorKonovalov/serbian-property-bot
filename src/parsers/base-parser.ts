import axios from 'axios'
import type { Listing, SearchParams } from './types'
import { createLogger } from '../logger'
import { config } from '../config'

export const MAX_PAGES = config.maxParserPages
export const REQUEST_TIMEOUT = config.requestTimeoutMs
export const PAGE_DELAY = config.pageDelayMs

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export const DEFAULT_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'sr-Latn-RS,sr;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Ch-Ua':
    '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
}

export async function fetchPage(
  url: string,
  source: string
): Promise<string | null> {
  try {
    const response = await axios.get(url, {
      headers: DEFAULT_HEADERS,
      timeout: REQUEST_TIMEOUT,
      maxContentLength: 10 * 1024 * 1024,
      maxBodyLength: 10 * 1024 * 1024,
    })
    if (response.status !== 200) {
      const log = createLogger(source)
      log.warn('fetchPage: unexpected status', { status: response.status, url })
      return null
    }
    return response.data
  } catch (error) {
    const log = createLogger(source)
    if (axios.isAxiosError(error) && error.response) {
      log.warn('fetchPage: HTTP error', { status: error.response.status, url })
    } else {
      log.error('fetchPage failed', {
        url,
        error: error instanceof Error ? error.message : String(error),
      })
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
  const log = createLogger(config.source)
  const allListings: Listing[] = []

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = config.buildUrl(params, page)
    log.info(`Fetching page ${page}`, { url })

    let html: string
    try {
      const start = Date.now()
      const response = await axios.get(url, {
        headers: DEFAULT_HEADERS,
        timeout: REQUEST_TIMEOUT,
        maxContentLength: 10 * 1024 * 1024,
        maxBodyLength: 10 * 1024 * 1024,
      })
      log.info(`Page ${page}`, {
        status: response.status,
        durationMs: Date.now() - start,
      })

      if (response.status !== 200) {
        log.warn('Unexpected status, stopping pagination', {
          status: response.status,
          page,
        })
        break
      }

      html = response.data
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const status = error.response.status
        if (status === 429) {
          log.warn('Rate limited (429), stopping pagination')
        } else {
          log.warn(`HTTP ${status} on page ${page}, stopping pagination`)
        }
      } else {
        log.error(`Request failed on page ${page}`, {
          error: error instanceof Error ? error.message : String(error),
        })
      }
      break
    }

    const listings = config.parsePage(html)
    log.info(`Page ${page}: ${listings.length} listings parsed`)
    allListings.push(...listings)

    if (!config.hasNextPage(html, page)) break

    if (page < MAX_PAGES) {
      await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY))
    }
  }

  return allListings
}
