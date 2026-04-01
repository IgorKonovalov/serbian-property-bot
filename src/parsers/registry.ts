import type { Listing, Parser, SearchParams } from './types'
import { createLogger } from '../logger'

const log = createLogger('registry')

export class ParserRegistry {
  private parsers: Parser[] = []

  register(parser: Parser): void {
    this.parsers.push(parser)
  }

  async searchAll(
    params: SearchParams,
    enabledSources?: string[]
  ): Promise<Listing[]> {
    const parsers = enabledSources
      ? this.parsers.filter((p) => enabledSources.includes(p.source))
      : this.parsers
    const skipped = enabledSources
      ? this.parsers
          .filter((p) => !enabledSources.includes(p.source))
          .map((p) => p.source)
      : []
    if (skipped.length > 0) {
      log.info('Skipped disabled sources', { sources: skipped })
    }
    log.info('Searching', {
      sources: parsers.map((p) => p.source),
      keywords: params.keywords,
      area: params.area,
    })
    const settled = await Promise.allSettled(
      parsers.map((p) => p.search(params))
    )
    const results: Listing[] = []
    for (let i = 0; i < settled.length; i++) {
      const result = settled[i]
      const source = parsers[i]?.source ?? 'unknown'
      if (result.status === 'fulfilled') {
        log.info(`${source}: ${result.value.length} listings`)
        results.push(...result.value)
      } else {
        log.error(`${source} failed`, { error: result.reason?.message })
      }
    }
    return results.sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
  }

  async searchCombined(
    paramsList: SearchParams[],
    enabledSources?: string[]
  ): Promise<Listing[]> {
    const results = await Promise.all(
      paramsList.map((params) => this.searchAll(params, enabledSources))
    )

    const seen = new Set<string>()
    const deduplicated: Listing[] = []

    for (const listing of results.flat()) {
      const key = `${listing.source}:${listing.externalId}`
      if (!seen.has(key)) {
        seen.add(key)
        deduplicated.push(listing)
      }
    }

    return deduplicated.sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
  }

  async fetchByUrl(url: string, source: string): Promise<Listing | null> {
    const parser = this.parsers.find((p) => p.source === source)
    if (!parser?.fetchByUrl) return null
    try {
      return await parser.fetchByUrl(url)
    } catch (error) {
      log.error('fetchByUrl failed', {
        source,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  get registeredSources(): string[] {
    return this.parsers.map((p) => p.source)
  }
}
