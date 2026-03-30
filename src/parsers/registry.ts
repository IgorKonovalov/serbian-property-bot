import type { Listing, Parser, SearchParams } from './types'

export class ParserRegistry {
  private parsers: Parser[] = []

  register(parser: Parser): void {
    this.parsers.push(parser)
  }

  async searchAll(params: SearchParams): Promise<Listing[]> {
    const results = await Promise.all(this.parsers.map((p) => p.search(params)))
    return results.flat().sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
  }

  async searchCombined(paramsList: SearchParams[]): Promise<Listing[]> {
    const results = await Promise.all(
      paramsList.map((params) => this.searchAll(params))
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
