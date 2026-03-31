import type { Listing, Parser, SearchParams } from './types'

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
      console.log(`[registry] Skipped disabled sources: ${skipped.join(', ')}`)
    }
    console.log(
      `[registry] Searching ${parsers.map((p) => p.source).join(', ')} | keywords="${params.keywords}" area="${params.area}"`
    )
    const settled = await Promise.allSettled(
      parsers.map((p) => p.search(params))
    )
    const results: Listing[] = []
    for (let i = 0; i < settled.length; i++) {
      const result = settled[i]
      const source = parsers[i]?.source ?? 'unknown'
      if (result.status === 'fulfilled') {
        console.log(`[registry] ${source}: ${result.value.length} listings`)
        results.push(...result.value)
      } else {
        console.error(`[registry] ${source} FAILED:`, result.reason?.message)
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

  get registeredSources(): string[] {
    return this.parsers.map((p) => p.source)
  }
}
