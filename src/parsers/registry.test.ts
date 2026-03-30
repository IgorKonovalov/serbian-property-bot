import { ParserRegistry } from './registry'
import type { Listing, Parser } from './types'

function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    externalId: '1',
    source: 'test',
    url: 'https://example.com/1',
    title: 'Test',
    price: 100000,
    size: 100,
    plotSize: null,
    rooms: 3,
    area: null,
    city: null,
    ...overrides,
  }
}

function makeParser(source: string, results: Listing[]): Parser {
  return {
    source,
    search: async () => results,
  }
}

describe('ParserRegistry', () => {
  describe('searchAll', () => {
    it('merges results from multiple parsers sorted by price', async () => {
      const registry = new ParserRegistry()
      registry.register(
        makeParser('site-a', [
          makeListing({ externalId: '1', source: 'site-a', price: 200000 }),
        ])
      )
      registry.register(
        makeParser('site-b', [
          makeListing({ externalId: '2', source: 'site-b', price: 50000 }),
        ])
      )

      const results = await registry.searchAll({ keywords: 'test', area: '' })
      expect(results).toHaveLength(2)
      expect(results[0].price).toBe(50000)
      expect(results[1].price).toBe(200000)
    })

    it('handles null prices (sorted to beginning)', async () => {
      const registry = new ParserRegistry()
      registry.register(
        makeParser('site-a', [
          makeListing({ externalId: '1', source: 'site-a', price: 100000 }),
          makeListing({ externalId: '2', source: 'site-a', price: null }),
        ])
      )

      const results = await registry.searchAll({ keywords: 'test', area: '' })
      expect(results[0].price).toBeNull()
      expect(results[1].price).toBe(100000)
    })
  })

  describe('searchCombined', () => {
    it('deduplicates listings by source:externalId', async () => {
      const registry = new ParserRegistry()
      registry.register(
        makeParser('site-a', [
          makeListing({ externalId: '100', source: 'site-a', price: 50000 }),
          makeListing({ externalId: '200', source: 'site-a', price: 75000 }),
        ])
      )

      // Two profiles that return overlapping results
      const results = await registry.searchCombined([
        { keywords: 'query1', area: '' },
        { keywords: 'query2', area: '' },
      ])

      // Same parser returns same results for both queries,
      // so dedup should reduce 4 → 2
      expect(results).toHaveLength(2)
    })

    it('keeps listings from different sources with same externalId', async () => {
      const registry = new ParserRegistry()
      registry.register(
        makeParser('site-a', [
          makeListing({ externalId: '100', source: 'site-a' }),
        ])
      )
      registry.register(
        makeParser('site-b', [
          makeListing({ externalId: '100', source: 'site-b' }),
        ])
      )

      const results = await registry.searchCombined([
        { keywords: 'test', area: '' },
      ])

      expect(results).toHaveLength(2)
    })

    it('sorts deduplicated results by price ascending', async () => {
      const registry = new ParserRegistry()
      registry.register(
        makeParser('site-a', [
          makeListing({ externalId: '1', source: 'site-a', price: 300000 }),
          makeListing({ externalId: '2', source: 'site-a', price: 100000 }),
          makeListing({ externalId: '3', source: 'site-a', price: 200000 }),
        ])
      )

      const results = await registry.searchCombined([
        { keywords: 'test', area: '' },
      ])

      expect(results.map((r) => r.price)).toEqual([100000, 200000, 300000])
    })

    it('returns empty array when no parsers registered', async () => {
      const registry = new ParserRegistry()
      const results = await registry.searchCombined([
        { keywords: 'test', area: '' },
      ])
      expect(results).toEqual([])
    })
  })
})
