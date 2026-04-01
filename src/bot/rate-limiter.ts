import type { Context, MiddlewareFn } from 'telegraf'
import { TTLMap } from './state-manager'
import { createLogger } from '../logger'

const log = createLogger('rate-limiter')

interface RateEntry {
  count: number
  windowStart: number
}

const WINDOW_MS = 60 * 1000 // 1 minute
const MAX_REQUESTS = 30

// Commands exempt from rate limiting (low-cost, user-friendly)
const EXEMPT_COMMANDS = new Set(['start', 'help'])

const counters = new TTLMap<number, RateEntry>(WINDOW_MS * 2)

export function rateLimiter(): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const userId = ctx.from?.id
    if (!userId) return next()

    // Exempt /start and /help commands
    if (
      'text' in (ctx.message ?? {}) &&
      EXEMPT_COMMANDS.has(
        ((ctx.message as { text?: string })?.text ?? '').replace('/', '').split(' ')[0]
      )
    ) {
      return next()
    }

    const now = Date.now()
    const entry = counters.get(userId)

    if (entry && now - entry.windowStart < WINDOW_MS) {
      entry.count++
      if (entry.count > MAX_REQUESTS) {
        log.warn('Rate limit exceeded', { userId, count: entry.count })
        if (ctx.callbackQuery) {
          await ctx.answerCbQuery('Слишком много запросов. Подождите минуту.')
        }
        return
      }
      counters.set(userId, entry)
    } else {
      counters.set(userId, { count: 1, windowStart: now })
    }

    return next()
  }
}
