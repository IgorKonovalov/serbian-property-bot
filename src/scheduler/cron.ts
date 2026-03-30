import cron from 'node-cron'
import type { Telegraf } from 'telegraf'
import type { ParserRegistry } from '../parsers/registry'
import { refreshFavoritePrices, sendDigestToAll } from './digest'

export function startScheduler(bot: Telegraf, registry: ParserRegistry): void {
  // 08:00 Belgrade time (CET/CEST depending on season)
  cron.schedule(
    '0 8 * * *',
    async () => {
      console.log('Running morning digest...')
      try {
        await refreshFavoritePrices(bot, registry)
        await sendDigestToAll(bot, registry)
        console.log('Morning digest complete')
      } catch (error) {
        console.error('Morning digest failed:', error)
      }
    },
    { timezone: 'Europe/Belgrade' }
  )

  console.log('Scheduler started: digest at 08:00 CET')
}
