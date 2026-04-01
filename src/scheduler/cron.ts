import cron from 'node-cron'
import type { Telegraf } from 'telegraf'
import type { ParserRegistry } from '../parsers/registry'
import { refreshFavoritePrices, sendDigestToAll } from './digest'
import { createLogger } from '../logger'
import { config } from '../config'

const log = createLogger('scheduler')

export function startScheduler(bot: Telegraf, registry: ParserRegistry): void {
  cron.schedule(
    config.digestCron,
    async () => {
      log.info('Running morning digest')
      try {
        await refreshFavoritePrices(bot, registry)
        await sendDigestToAll(bot, registry)
        log.info('Morning digest complete')
      } catch (error) {
        log.error('Morning digest failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
    { timezone: config.digestTimezone }
  )

  log.info('Scheduler started', {
    cron: config.digestCron,
    timezone: config.digestTimezone,
  })
}
