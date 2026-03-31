import { Telegraf } from 'telegraf'
import { config } from '../config'
import type { ParserRegistry } from '../parsers/registry'
import { registerStartCommand } from './commands/start'
import { registerSearchCommand } from './commands/search'
import { registerProfilesCommand } from './commands/profiles'
import { registerFavoritesCommand } from './commands/favorites'
import { registerDigestCommand } from './commands/digest'
import { registerHelpCommand } from './commands/help'
import { registerSettingsCommand } from './commands/settings'

export function createBot(registry: ParserRegistry): Telegraf {
  const bot = new Telegraf(config.botToken)

  registerStartCommand(bot)
  registerSearchCommand(bot, registry)
  registerProfilesCommand(bot)
  registerFavoritesCommand(bot)
  registerDigestCommand(bot, registry)
  registerSettingsCommand(bot, registry)
  registerHelpCommand(bot)

  bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}:`, err)
    ctx.reply('Something went wrong. Please try again.').catch(() => {})
  })

  return bot
}
