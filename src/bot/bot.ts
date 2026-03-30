import { Telegraf } from 'telegraf'
import { config } from '../config'
import { registerStartCommand } from './commands/start'

export function createBot(): Telegraf {
  const bot = new Telegraf(config.botToken)

  registerStartCommand(bot)

  bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}:`, err)
    ctx.reply('Something went wrong. Please try again.').catch(() => {})
  })

  return bot
}
