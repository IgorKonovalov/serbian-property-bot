/**
 * A Map with automatic TTL-based eviction.
 * Entries are deleted after `ttlMs` since their last set/update.
 * Cleanup runs on a configurable interval.
 */
export class TTLMap<K, V> {
  private readonly entries = new Map<K, { value: V; updatedAt: number }>()
  private readonly timer: ReturnType<typeof setInterval>

  constructor(
    private readonly ttlMs: number,
    cleanupIntervalMs: number = 5 * 60 * 1000
  ) {
    this.timer = setInterval(() => this.evict(), cleanupIntervalMs)
    // Allow Node to exit even if the timer is still running
    if (this.timer.unref) {
      this.timer.unref()
    }
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (Date.now() - entry.updatedAt > this.ttlMs) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: K, value: V): void {
    this.entries.set(key, { value, updatedAt: Date.now() })
  }

  has(key: K): boolean {
    return this.get(key) !== undefined
  }

  delete(key: K): boolean {
    return this.entries.delete(key)
  }

  get size(): number {
    return this.entries.size
  }

  private evict(): void {
    const now = Date.now()
    for (const [key, entry] of this.entries) {
      if (now - entry.updatedAt > this.ttlMs) {
        this.entries.delete(key)
      }
    }
  }

  destroy(): void {
    clearInterval(this.timer)
    this.entries.clear()
  }
}
