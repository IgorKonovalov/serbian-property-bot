import { Telegraf, Markup } from 'telegraf'
import { messages } from '../messages'

function helpKeyboard(): ReturnType<typeof Markup.inlineKeyboard> {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🔍 Поиск', 'help_search'),
      Markup.button.callback('📋 Профили', 'help_profiles'),
    ],
    [
      Markup.button.callback('⭐ Избранное', 'help_favorites'),
      Markup.button.callback('📊 Дайджест', 'help_digest'),
    ],
  ])
}

function backKeyboard(): ReturnType<typeof Markup.inlineKeyboard> {
  return Markup.inlineKeyboard([
    [Markup.button.callback(messages.helpBack, 'help_back')],
  ])
}

export function registerHelpCommand(bot: Telegraf): void {
  bot.command('help', async (ctx) => {
    await ctx.reply(messages.helpIntro, {
      parse_mode: 'HTML',
      ...helpKeyboard(),
    })
  })

  bot.action('help_show', async (ctx) => {
    await ctx.reply(messages.helpIntro, {
      parse_mode: 'HTML',
      ...helpKeyboard(),
    })
    await ctx.answerCbQuery()
  })

  bot.action('help_back', async (ctx) => {
    await ctx.editMessageText(messages.helpIntro, {
      parse_mode: 'HTML',
      ...helpKeyboard(),
    })
    await ctx.answerCbQuery()
  })

  bot.action('help_search', async (ctx) => {
    await ctx.editMessageText(messages.helpSearch, {
      parse_mode: 'HTML',
      ...backKeyboard(),
    })
    await ctx.answerCbQuery()
  })

  bot.action('help_profiles', async (ctx) => {
    await ctx.editMessageText(messages.helpProfiles, {
      parse_mode: 'HTML',
      ...backKeyboard(),
    })
    await ctx.answerCbQuery()
  })

  bot.action('help_favorites', async (ctx) => {
    await ctx.editMessageText(messages.helpFavorites, {
      parse_mode: 'HTML',
      ...backKeyboard(),
    })
    await ctx.answerCbQuery()
  })

  bot.action('help_digest', async (ctx) => {
    await ctx.editMessageText(messages.helpDigest, {
      parse_mode: 'HTML',
      ...backKeyboard(),
    })
    await ctx.answerCbQuery()
  })
}
