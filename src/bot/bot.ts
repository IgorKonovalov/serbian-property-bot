import { Telegraf, Markup } from 'telegraf'
import { config } from '../config'
import type { ParserRegistry } from '../parsers/registry'
import { registerStartCommand } from './commands/start'
import { registerSearchCommand } from './commands/search'
import { registerProfilesCommand } from './commands/profiles'
import { registerFavoritesCommand } from './commands/favorites'
import { registerDigestCommand } from './commands/digest'
import { registerHelpCommand } from './commands/help'
import { registerSettingsCommand } from './commands/settings'
import { createLogger } from '../logger'
import { rateLimiter } from './rate-limiter'

const log = createLogger('bot')

export function createBot(registry: ParserRegistry): Telegraf {
  const bot = new Telegraf(config.botToken)

  bot.use(rateLimiter())

  registerStartCommand(bot)
  registerSearchCommand(bot, registry)
  registerProfilesCommand(bot)
  registerFavoritesCommand(bot)
  registerDigestCommand(bot, registry)
  registerSettingsCommand(bot, registry)
  registerHelpCommand(bot)

  bot.catch((err, ctx) => {
    log.error('Unhandled error', {
      updateType: ctx.updateType,
      error: err instanceof Error ? err.message : String(err),
    })
    ctx
      .reply('Что-то пошло не так. Попробуйте ещё раз.', {
        ...Markup.inlineKeyboard([
          [Markup.button.callback('❓ Помощь', 'help_show')],
        ]),
      })
      .catch(() => {})
  })

  return bot
}
