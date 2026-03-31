import { Telegraf, Markup } from 'telegraf'
import { findOrCreateUser } from '../../db/queries/users'
import { messages } from '../messages'

export function mainMenuKeyboard(): ReturnType<typeof Markup.inlineKeyboard> {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🔍 Поиск', 'search_restart'),
      Markup.button.callback('📋 Профили', 'prof_list'),
    ],
    [
      Markup.button.callback('⭐ Избранное', 'fav_show'),
      Markup.button.callback('📊 Дайджест', 'digest_retry'),
    ],
    [
      Markup.button.callback('⚙️ Настройки', 'set_sites'),
      Markup.button.callback('❓ Помощь', 'help_show'),
    ],
  ])
}

export function registerStartCommand(bot: Telegraf): void {
  bot.start(async (ctx) => {
    findOrCreateUser(ctx.from.id, ctx.from.username)

    await ctx.reply(messages.welcome, {
      parse_mode: 'HTML',
      ...mainMenuKeyboard(),
    })
  })

  bot.action('menu_back', async (ctx) => {
    await ctx.editMessageText(messages.welcome, {
      parse_mode: 'HTML',
      ...mainMenuKeyboard(),
    })
    await ctx.answerCbQuery()
  })
}
