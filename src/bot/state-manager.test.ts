import { TTLMap } from './state-manager'

describe('TTLMap', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('stores and retrieves values', () => {
    const map = new TTLMap<string, number>(60_000)
    map.set('a', 1)
    expect(map.get('a')).toBe(1)
    map.destroy()
  })

  it('returns undefined for missing keys', () => {
    const map = new TTLMap<string, number>(60_000)
    expect(map.get('missing')).toBeUndefined()
    map.destroy()
  })

  it('deletes entries', () => {
    const map = new TTLMap<string, number>(60_000)
    map.set('a', 1)
    expect(map.delete('a')).toBe(true)
    expect(map.get('a')).toBeUndefined()
    map.destroy()
  })

  it('reports has correctly', () => {
    const map = new TTLMap<string, number>(60_000)
    map.set('a', 1)
    expect(map.has('a')).toBe(true)
    expect(map.has('b')).toBe(false)
    map.destroy()
  })

  it('reports size', () => {
    const map = new TTLMap<string, number>(60_000)
    map.set('a', 1)
    map.set('b', 2)
    expect(map.size).toBe(2)
    map.destroy()
  })

  it('expires entries after TTL on get', () => {
    jest.useFakeTimers()
    const map = new TTLMap<string, number>(1000, 999_999)
    map.set('a', 1)

    jest.advanceTimersByTime(500)
    expect(map.get('a')).toBe(1)

    jest.advanceTimersByTime(600)
    expect(map.get('a')).toBeUndefined()
    map.destroy()
  })

  it('expires entries after TTL on has', () => {
    jest.useFakeTimers()
    const map = new TTLMap<string, number>(1000, 999_999)
    map.set('a', 1)

    jest.advanceTimersByTime(1100)
    expect(map.has('a')).toBe(false)
    map.destroy()
  })

  it('evicts expired entries on cleanup interval', () => {
    jest.useFakeTimers()
    const map = new TTLMap<string, number>(1000, 2000)
    map.set('a', 1)
    map.set('b', 2)

    jest.advanceTimersByTime(1500)
    map.set('c', 3) // fresh entry

    jest.advanceTimersByTime(600) // triggers cleanup at 2100ms
    // a and b are expired (set at 0, TTL 1000), c is fresh (set at 1500)
    expect(map.size).toBe(1)
    expect(map.get('c')).toBe(3)
    map.destroy()
  })

  it('refreshes TTL on set', () => {
    jest.useFakeTimers()
    const map = new TTLMap<string, number>(1000, 999_999)
    map.set('a', 1)

    jest.advanceTimersByTime(800)
    map.set('a', 2) // refresh

    jest.advanceTimersByTime(800)
    expect(map.get('a')).toBe(2) // still alive (800ms since refresh)
    map.destroy()
  })

  it('clears everything on destroy', () => {
    const map = new TTLMap<string, number>(60_000)
    map.set('a', 1)
    map.destroy()
    expect(map.size).toBe(0)
  })
})
