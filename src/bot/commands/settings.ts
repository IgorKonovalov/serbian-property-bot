import { Telegraf, Markup } from 'telegraf'
import { findOrCreateUser } from '../../db/queries/users'
import { isSiteEnabled, toggleSite } from '../../db/queries/user-settings'
import type { ParserRegistry } from '../../parsers/registry'
import { messages } from '../messages'

const SOURCE_LABELS: Record<string, string> = {
  halooglasi: 'Halooglasi',
  nekretnine: 'Nekretnine.rs',
  kupujemprodajem: 'KupujemProdajem',
  '4zida': '4zida.rs',
  oglasi: 'Oglasi.rs',
}

function getSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source
}

function buildSettingsKeyboard(): ReturnType<typeof Markup.inlineKeyboard> {
  return Markup.inlineKeyboard([
    [Markup.button.callback(messages.settingsSources, 'set_sites')],
    [Markup.button.callback(messages.buttonMainMenu, 'menu_back')],
  ])
}

function buildSitesKeyboard(
  userId: number,
  sources: string[]
): ReturnType<typeof Markup.inlineKeyboard> {
  const rows = sources.map((source) => {
    const enabled = isSiteEnabled(userId, source)
    const icon = enabled ? '✅' : '◻️'
    return [
      Markup.button.callback(
        `${icon} ${getSourceLabel(source)}`,
        `set_site_${source}`
      ),
    ]
  })

  rows.push([Markup.button.callback(messages.settingsBackToMenu, 'set_back')])

  return Markup.inlineKeyboard(rows)
}

export function registerSettingsCommand(
  bot: Telegraf,
  registry: ParserRegistry
): void {
  bot.command('settings', async (ctx) => {
    await ctx.reply(messages.settingsTitle, {
      parse_mode: 'HTML',
      ...buildSettingsKeyboard(),
    })
  })

  bot.action('set_sites', async (ctx) => {
    const user = findOrCreateUser(ctx.from.id, ctx.from.username)
    const sources = registry.registeredSources

    await ctx.editMessageText(messages.settingsSourcesTitle, {
      parse_mode: 'HTML',
      ...buildSitesKeyboard(user.id, sources),
    })
    await ctx.answerCbQuery()
  })

  bot.action(/^set_site_(.+)$/, async (ctx) => {
    const user = findOrCreateUser(ctx.from.id, ctx.from.username)
    const source = ctx.match[1]
    const sources = registry.registeredSources

    if (!sources.includes(source)) {
      await ctx.answerCbQuery()
      return
    }

    const nowEnabled = toggleSite(user.id, source)

    await ctx.editMessageReplyMarkup(
      buildSitesKeyboard(user.id, sources).reply_markup
    )
    await ctx.answerCbQuery(
      nowEnabled ? messages.settingsSiteEnabled : messages.settingsSiteDisabled
    )
  })

  bot.action('set_back', async (ctx) => {
    await ctx.editMessageText(messages.settingsTitle, {
      parse_mode: 'HTML',
      ...buildSettingsKeyboard(),
    })
    await ctx.answerCbQuery()
  })
}
