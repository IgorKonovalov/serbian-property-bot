import { parsePrice, parseSize, parseRooms, parsePlotSize } from './parse-helpers'

describe('parsePrice', () => {
  it('parses dot-separated thousands', () => {
    expect(parsePrice('449.000')).toBe(449000)
  })

  it('parses price with currency symbol', () => {
    expect(parsePrice('295.000 €')).toBe(295000)
  })

  it('parses clean number', () => {
    expect(parsePrice('50000')).toBe(50000)
  })

  it('parses price with spaces', () => {
    expect(parsePrice('21 000')).toBe(21000)
  })

  it('returns null for empty/undefined', () => {
    expect(parsePrice(undefined)).toBeNull()
    expect(parsePrice('')).toBeNull()
  })

  it('returns null for non-numeric text', () => {
    expect(parsePrice('Dogovor')).toBeNull()
  })

  it('returns null for zero', () => {
    expect(parsePrice('0')).toBeNull()
  })
})

describe('parseSize', () => {
  it('parses "80 m²"', () => {
    expect(parseSize('80 m²')).toBe(80)
  })

  it('parses "131m2"', () => {
    expect(parseSize('131m2')).toBe(131)
  })

  it('parses decimal "95.5 m²"', () => {
    expect(parseSize('95.5 m²')).toBe(96)
  })

  it('parses comma decimal "95,5 m²"', () => {
    expect(parseSize('95,5 m²')).toBe(96)
  })

  it('parses size from feature text', () => {
    expect(parseSize('Površina: 120 m2, soba: 3')).toBe(120)
  })

  it('returns null for empty/undefined', () => {
    expect(parseSize(undefined)).toBeNull()
    expect(parseSize('')).toBeNull()
  })

  it('returns null for no match', () => {
    expect(parseSize('no size here')).toBeNull()
  })
})

describe('parseRooms', () => {
  it('parses "3.0 Broj soba" format', () => {
    expect(parseRooms('3.0 Broj soba')).toBe(3)
  })

  it('parses "Broj soba: 2.5" format', () => {
    expect(parseRooms('Broj soba: 2.5')).toBe(2.5)
  })

  it('parses "4.0 četvorosobna" format', () => {
    expect(parseRooms('4.0 četvorosobna')).toBe(4)
  })

  it('parses "2.0 dvosobna" format', () => {
    expect(parseRooms('2.0 dvosobna')).toBe(2)
  })

  it('parses "5+ petosobna" format', () => {
    expect(parseRooms('5+ petosobna')).toBe(5)
  })

  it('parses comma decimal "Broj soba: 2,5"', () => {
    expect(parseRooms('Broj soba: 2,5')).toBe(2.5)
  })

  it('returns null for empty/undefined', () => {
    expect(parseRooms(undefined)).toBeNull()
    expect(parseRooms('')).toBeNull()
  })

  it('returns null for no match', () => {
    expect(parseRooms('no rooms info')).toBeNull()
  })
})

describe('parsePlotSize', () => {
  it('parses "500 m2" to 5 ares', () => {
    expect(parsePlotSize('Površina zemljišta: 500 m2')).toBe(5)
  })

  it('parses "1000 m²" to 10 ares', () => {
    expect(parsePlotSize('1000 m²')).toBe(10)
  })

  it('rounds correctly', () => {
    expect(parsePlotSize('750 m2')).toBe(8) // 7.5 rounds to 8
  })

  it('returns null for empty/undefined', () => {
    expect(parsePlotSize(undefined)).toBeNull()
    expect(parsePlotSize('')).toBeNull()
  })

  it('returns null for no match', () => {
    expect(parsePlotSize('no plot here')).toBeNull()
  })
})
