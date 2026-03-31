import { Telegraf, Markup } from 'telegraf'
import { findOrCreateUser } from '../../db/queries/users'
import { messages } from '../messages'

export function registerStartCommand(bot: Telegraf): void {
  bot.start(async (ctx) => {
    const telegramId = ctx.from.id
    const username = ctx.from.username

    findOrCreateUser(telegramId, username)

    await ctx.reply(messages.welcome, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(messages.helpButton, 'help_show')],
      ]),
    })
  })
}
