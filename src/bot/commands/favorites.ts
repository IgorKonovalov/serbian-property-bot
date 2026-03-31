import { Telegraf, Markup } from 'telegraf'
import type { InlineKeyboardButton, InlineKeyboardMarkup } from 'telegraf/types'
import { findOrCreateUser } from '../../db/queries/users'
import {
  getUserFavorites,
  removeFavorite,
  clearAllFavorites,
} from '../../db/queries/favorites'
import { messages } from '../messages'
import { escapeHtml } from '../../utils'

const FAVORITES_PER_PAGE = 5

const userPages = new Map<number, number>()

function buildFavoritesPage(
  userId: number,
  page: number
): {
  text: string
  keyboard: { reply_markup: InlineKeyboardMarkup } | undefined
} {
  const favorites = getUserFavorites(userId)

  if (favorites.length === 0) {
    return {
      text: messages.favoritesEmpty,
      keyboard: {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: messages.buttonNewSearch,
                callback_data: 'search_restart',
              } as InlineKeyboardButton.CallbackButton,
            ],
          ],
        },
      },
    }
  }

  const totalPages = Math.ceil(favorites.length / FAVORITES_PER_PAGE)
  const safePage = Math.min(page, totalPages - 1)
  const start = safePage * FAVORITES_PER_PAGE
  const end = Math.min(start + FAVORITES_PER_PAGE, favorites.length)
  const pageFavs = favorites.slice(start, end)

  const rows: InlineKeyboardButton[][] = []
  const lines: string[] = [messages.favoritesTitle, '']

  pageFavs.forEach((fav, i) => {
    const rooms = fav.rooms ? `${fav.rooms} комн., ` : ''
    const size = fav.size ? `${fav.size}м²` : ''
    const price = fav.price
      ? `€${fav.price.toLocaleString('ru-RU')}`
      : 'Цена не указана'
    const location = [fav.city, fav.area].filter(Boolean).join(', ')

    lines.push(
      `${start + i + 1}. 🏠 ${rooms}${size} — ${price}\n` +
        `📍 ${escapeHtml(location || 'Н/Д')} | <a href="${fav.url}">${escapeHtml(fav.source)}</a>`
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

  // Pagination
  const navRow: InlineKeyboardButton.CallbackButton[] = []
  if (safePage > 0) {
    navRow.push({
      text: messages.buttonPrev,
      callback_data: `fpage_${safePage - 1}`,
    })
  }
  if (safePage < totalPages - 1) {
    navRow.push({
      text: messages.buttonNext,
      callback_data: `fpage_${safePage + 1}`,
    })
  }
  if (navRow.length > 0) {
    rows.push(navRow)
  }

  // Bulk clear (only when > 3 favorites)
  if (favorites.length > 3) {
    rows.push([
      {
        text: messages.favoritesClearAll,
        callback_data: 'fav_clearall',
      } as InlineKeyboardButton.CallbackButton,
    ])
  }

  lines.push('', messages.resultHeader(start + 1, end, favorites.length))

  return {
    text: lines.join('\n'),
    keyboard: { reply_markup: { inline_keyboard: rows } },
  }
}

export function registerFavoritesCommand(bot: Telegraf): void {
  bot.command('favorites', async (ctx) => {
    const user = findOrCreateUser(ctx.from.id, ctx.from.username)
    userPages.set(ctx.from.id, 0)
    const { text, keyboard } = buildFavoritesPage(user.id, 0)

    if (keyboard) {
      await ctx.reply(text, { ...keyboard, parse_mode: 'HTML' })
    } else {
      await ctx.reply(text)
    }
  })

  // Pagination
  bot.action(/^fpage_(\d+)$/, async (ctx) => {
    const user = findOrCreateUser(ctx.from.id, ctx.from.username)
    const page = parseInt(ctx.match[1], 10)
    userPages.set(ctx.from.id, page)

    const { text, keyboard } = buildFavoritesPage(user.id, page)

    if (keyboard) {
      await ctx.editMessageText(text, { ...keyboard, parse_mode: 'HTML' })
    } else {
      await ctx.editMessageText(text)
    }
    await ctx.answerCbQuery()
  })

  // Remove single favorite
  bot.action(/^fav_rm_(\d+)$/, async (ctx) => {
    const user = findOrCreateUser(ctx.from.id, ctx.from.username)
    const listingId = parseInt(ctx.match[1], 10)
    removeFavorite(user.id, listingId)

    const page = userPages.get(ctx.from.id) ?? 0
    const { text, keyboard } = buildFavoritesPage(user.id, page)

    if (keyboard) {
      await ctx.editMessageText(text, { ...keyboard, parse_mode: 'HTML' })
    } else {
      await ctx.editMessageText(text)
    }
    await ctx.answerCbQuery(messages.favoritesRemoved)
  })

  // Bulk clear — confirmation
  bot.action('fav_clearall', async (ctx) => {
    const user = findOrCreateUser(ctx.from.id, ctx.from.username)
    const favorites = getUserFavorites(user.id)

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          {
            text: messages.favoritesClearConfirmYes,
            callback_data: 'fav_clearok',
          } as InlineKeyboardButton.CallbackButton,
          {
            text: messages.buttonCancel,
            callback_data: 'fav_cancelclear',
          } as InlineKeyboardButton.CallbackButton,
        ],
      ],
    }

    await ctx.editMessageText(
      messages.favoritesClearConfirm(favorites.length),
      { reply_markup: keyboard }
    )
    await ctx.answerCbQuery()
  })

  // Confirm bulk clear
  bot.action('fav_clearok', async (ctx) => {
    const user = findOrCreateUser(ctx.from.id, ctx.from.username)
    clearAllFavorites(user.id)
    userPages.delete(ctx.from.id)

    await ctx.editMessageText(messages.favoritesCleared, {
      ...Markup.inlineKeyboard([
        [Markup.button.callback(messages.buttonNewSearch, 'search_restart')],
      ]),
    })
    await ctx.answerCbQuery()
  })

  // Cancel bulk clear — back to favorites
  bot.action('fav_cancelclear', async (ctx) => {
    const user = findOrCreateUser(ctx.from.id, ctx.from.username)
    const page = userPages.get(ctx.from.id) ?? 0
    const { text, keyboard } = buildFavoritesPage(user.id, page)

    if (keyboard) {
      await ctx.editMessageText(text, { ...keyboard, parse_mode: 'HTML' })
    } else {
      await ctx.editMessageText(text)
    }
    await ctx.answerCbQuery()
  })
}
