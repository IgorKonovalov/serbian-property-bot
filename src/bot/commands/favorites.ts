import { Telegraf } from 'telegraf'
import type { InlineKeyboardButton, InlineKeyboardMarkup } from 'telegraf/types'
import { findOrCreateUser } from '../../db/queries/users'
import { getUserFavorites, removeFavorite } from '../../db/queries/favorites'
import { messages } from '../messages'

function buildFavoritesMessage(userId: number): {
  text: string
  keyboard: { reply_markup: InlineKeyboardMarkup } | undefined
} {
  const favorites = getUserFavorites(userId)

  if (favorites.length === 0) {
    return { text: messages.favoritesEmpty, keyboard: undefined }
  }

  const rows: InlineKeyboardButton[][] = []
  const lines: string[] = [messages.favoritesTitle, '']

  favorites.forEach((fav, i) => {
    const rooms = fav.rooms ? `${fav.rooms} комн., ` : ''
    const size = fav.size ? `${fav.size}м²` : ''
    const price = fav.price
      ? `€${fav.price.toLocaleString('ru-RU')}`
      : 'Цена не указана'
    const location = [fav.city, fav.area].filter(Boolean).join(', ')

    lines.push(
      `${i + 1}. 🏠 ${rooms}${size} — ${price}\n` +
        `📍 ${location || 'Н/Д'} | <a href="${fav.url}">${fav.source}</a>`
    )

    rows.push([
      {
        text: messages.buttonView,
        url: fav.url,
      } as InlineKeyboardButton.UrlButton,
      {
        text: messages.favoritesRemove,
        callback_data: `fav_rm_${fav.listing_id}`,
      } as InlineKeyboardButton.CallbackButton,
    ])
  })

  return {
    text: lines.join('\n'),
    keyboard: { reply_markup: { inline_keyboard: rows } },
  }
}

export function registerFavoritesCommand(bot: Telegraf): void {
  bot.command('favorites', async (ctx) => {
    const user = findOrCreateUser(ctx.from.id, ctx.from.username)
    const { text, keyboard } = buildFavoritesMessage(user.id)

    if (keyboard) {
      await ctx.reply(text, { ...keyboard, parse_mode: 'HTML' })
    } else {
      await ctx.reply(text)
    }
  })

  bot.action(/^fav_rm_(\d+)$/, async (ctx) => {
    const user = findOrCreateUser(ctx.from.id, ctx.from.username)
    const listingId = parseInt(ctx.match[1], 10)
    removeFavorite(user.id, listingId)

    const { text, keyboard } = buildFavoritesMessage(user.id)

    if (keyboard) {
      await ctx.editMessageText(text, { ...keyboard, parse_mode: 'HTML' })
    } else {
      await ctx.editMessageText(text)
    }
    await ctx.answerCbQuery(messages.favoritesRemoved)
  })
}
