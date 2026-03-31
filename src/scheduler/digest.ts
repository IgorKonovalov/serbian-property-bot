import type { Telegraf } from 'telegraf'
import type { InlineKeyboardButton, InlineKeyboardMarkup } from 'telegraf/types'
import { getAllUsers } from '../db/queries/users'
import { getUserProfiles } from '../db/queries/search-profiles'
import { getEnabledSites } from '../db/queries/user-settings'
import {
  getPriceChangesForUser,
  upsertListing,
  type PriceChange,
} from '../db/queries/listings'
import { getUserFavorites } from '../db/queries/favorites'
import type { ParserRegistry } from '../parsers/registry'
import type { Listing, SearchParams } from '../parsers/types'
import { messages } from '../bot/messages'

function formatPriceChange(pc: PriceChange): string {
  const pctChange = ((pc.new_price - pc.old_price) / pc.old_price) * 100
  const direction = pctChange > 0 ? '📈' : '📉'
  const sign = pctChange > 0 ? '+' : ''
  const location = [pc.city, pc.area].filter(Boolean).join(', ')

  return (
    `${direction} ${pc.title ?? 'Без названия'}\n` +
    `💰 €${pc.old_price.toLocaleString('ru-RU')} → €${pc.new_price.toLocaleString('ru-RU')} (${sign}${pctChange.toFixed(1)}%)\n` +
    `📍 ${location || 'Н/Д'}\n` +
    `🔗 <a href="${pc.url}">${pc.source}</a>`
  )
}

function formatNewListing(l: Listing, i: number): string {
  const rooms = l.rooms ? `${l.rooms} комн., ` : ''
  const size = l.size ? `${l.size}м²` : ''
  const price = l.price
    ? `€${l.price.toLocaleString('ru-RU')}`
    : 'Цена не указана'
  const location = [l.city, l.area].filter(Boolean).join(', ')

  return (
    `${i + 1}. 🏠 ${rooms}${size} — ${price}\n` +
    `   📍 ${location || 'Н/Д'} | <a href="${l.url}">${l.source}</a>`
  )
}

export interface DigestData {
  priceChanges: PriceChange[]
  newListings: Listing[]
}

export async function buildDigestData(
  userId: number,
  registry: ParserRegistry
): Promise<DigestData> {
  const priceChanges = getPriceChangesForUser(userId)

  const profiles = getUserProfiles(userId).filter((p) => p.is_active)
  let newListings: Listing[] = []

  if (profiles.length > 0) {
    const paramsList: SearchParams[] = profiles.map((p) => ({
      keywords: p.keywords,
      area: '',
      minPrice: p.min_price ?? undefined,
      maxPrice: p.max_price ?? undefined,
      minSize: p.min_size ?? undefined,
      maxSize: p.max_size ?? undefined,
      minPlotSize: p.min_plot_size ?? undefined,
    }))

    try {
      const enabledSources = getEnabledSites(userId, registry.registeredSources)
      const results = await registry.searchCombined(paramsList, enabledSources)

      for (const listing of results) {
        upsertListing(listing)
      }

      newListings = results
    } catch (error) {
      console.error('Digest scrape failed:', error)
    }
  }

  return { priceChanges, newListings }
}

export function buildDigestSummary(data: DigestData): {
  text: string
  keyboard: InlineKeyboardMarkup
} | null {
  const { priceChanges, newListings } = data

  if (priceChanges.length === 0 && newListings.length === 0) return null

  const lines: string[] = [messages.digestSummaryTitle]
  const buttons: InlineKeyboardButton.CallbackButton[][] = []

  if (newListings.length > 0) {
    const today = new Date()
    const dateStr = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}`
    lines.push(`🆕 Новых: ${newListings.length}`)
    buttons.push([
      {
        text: messages.digestNewButton(newListings.length, dateStr),
        callback_data: 'digest_new',
      },
    ])
  }

  if (priceChanges.length > 0) {
    lines.push(`📊 Изменений цен: ${priceChanges.length}`)
    buttons.push([
      {
        text: messages.digestPriceButton(priceChanges.length),
        callback_data: 'digest_prices',
      },
    ])
  }

  return {
    text: lines.join('\n'),
    keyboard: { inline_keyboard: buttons },
  }
}

export function buildNewListingsMessage(listings: Listing[]): string {
  const top10 = listings.slice(0, 10)
  return messages.digestNewTitle + top10.map(formatNewListing).join('\n\n')
}

export function buildPriceChangesMessage(changes: PriceChange[]): string {
  return messages.digestPriceTitle + changes.map(formatPriceChange).join('\n\n')
}

// Legacy function for backward compatibility with buildDigestForUser
export async function buildDigestForUser(
  userId: number,
  registry: ParserRegistry
): Promise<DigestData | null> {
  const data = await buildDigestData(userId, registry)
  if (data.priceChanges.length === 0 && data.newListings.length === 0)
    return null
  return data
}

export async function sendDigestToAll(
  bot: Telegraf,
  registry: ParserRegistry
): Promise<void> {
  const users = getAllUsers()

  for (const user of users) {
    try {
      const data = await buildDigestData(user.id, registry)
      const summary = buildDigestSummary(data)

      if (summary) {
        await bot.telegram.sendMessage(user.telegram_id, summary.text, {
          parse_mode: 'HTML',
          reply_markup: summary.keyboard,
        })
        console.log(`Digest sent to user ${user.telegram_id}`)
      } else {
        console.log(
          `No digest for user ${user.telegram_id} (nothing to report)`
        )
      }
    } catch (error) {
      console.error(`Failed to send digest to user ${user.telegram_id}:`, error)
    }
  }
}

export async function refreshFavoritePrices(
  bot: Telegraf,
  registry: ParserRegistry
): Promise<void> {
  const users = getAllUsers()

  for (const user of users) {
    const favorites = getUserFavorites(user.id)
    if (favorites.length === 0) continue

    const profiles = getUserProfiles(user.id).filter((p) => p.is_active)
    if (profiles.length === 0) continue

    const paramsList: SearchParams[] = profiles.map((p) => ({
      keywords: p.keywords,
      area: '',
      minPrice: p.min_price ?? undefined,
      maxPrice: p.max_price ?? undefined,
      minSize: p.min_size ?? undefined,
      maxSize: p.max_size ?? undefined,
      minPlotSize: p.min_plot_size ?? undefined,
    }))

    try {
      const enabledSources = getEnabledSites(
        user.id,
        registry.registeredSources
      )
      const results = await registry.searchCombined(paramsList, enabledSources)
      for (const listing of results) {
        upsertListing(listing)
      }
    } catch (error) {
      console.error('Failed to refresh prices:', error)
    }
  }
}
