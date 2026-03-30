import type { Telegraf } from 'telegraf'
import { getAllUsers } from '../db/queries/users'
import { getUserProfiles } from '../db/queries/search-profiles'
import {
  getPriceChangesForUser,
  upsertListing,
  type PriceChange,
} from '../db/queries/listings'
import { getUserFavorites } from '../db/queries/favorites'
import type { ParserRegistry } from '../parsers/registry'
import type { SearchParams } from '../parsers/types'

function formatPriceChange(pc: PriceChange): string {
  const pctChange = ((pc.new_price - pc.old_price) / pc.old_price) * 100
  const direction = pctChange > 0 ? '📈' : '📉'
  const sign = pctChange > 0 ? '+' : ''
  const location = [pc.city, pc.area].filter(Boolean).join(', ')

  return (
    `${direction} ${pc.title ?? 'Без названия'}\n` +
    `💰 €${pc.old_price.toLocaleString('ru-RU')} → €${pc.new_price.toLocaleString('ru-RU')} (${sign}${pctChange.toFixed(1)}%)\n` +
    `📍 ${location || 'Н/Д'}\n` +
    `🔗 ${pc.source}`
  )
}

export async function buildDigestForUser(
  userId: number,
  registry: ParserRegistry
): Promise<string | null> {
  const sections: string[] = []

  // 1. Price changes on favorites
  const priceChanges = getPriceChangesForUser(userId)
  if (priceChanges.length > 0) {
    sections.push(
      '📊 *Изменения цен:*\n\n' +
        priceChanges.map(formatPriceChange).join('\n\n')
    )
  }

  // 2. New listings matching active profiles
  const profiles = getUserProfiles(userId).filter((p) => p.is_active)
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
      const results = await registry.searchCombined(paramsList)

      // Upsert all to DB (this also records price changes)
      for (const listing of results) {
        upsertListing(listing)
      }

      if (results.length > 0) {
        const top10 = results.slice(0, 10)
        const listingLines = top10.map((l, i) => {
          const rooms = l.rooms ? `${l.rooms} комн., ` : ''
          const size = l.size ? `${l.size}м²` : ''
          const price = l.price
            ? `€${l.price.toLocaleString('ru-RU')}`
            : 'Цена не указана'
          const location = [l.city, l.area].filter(Boolean).join(', ')

          return (
            `${i + 1}. 🏠 ${rooms}${size} — ${price}\n` +
            `   📍 ${location || 'Н/Д'} | ${l.source}`
          )
        })

        sections.push(
          `🆕 *Новые объявления* (${results.length} найдено):\n\n` +
            listingLines.join('\n\n')
        )
      }
    } catch (error) {
      console.error('Digest scrape failed:', error)
    }
  }

  if (sections.length === 0) return null

  return '🏠 *Утренний дайджест*\n\n' + sections.join('\n\n───\n\n')
}

export async function sendDigestToAll(
  bot: Telegraf,
  registry: ParserRegistry
): Promise<void> {
  const users = getAllUsers()

  for (const user of users) {
    try {
      const digest = await buildDigestForUser(user.id, registry)
      if (digest) {
        await bot.telegram.sendMessage(user.telegram_id, digest, {
          parse_mode: 'Markdown',
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
  // Re-scrape to update prices before checking changes
  const users = getAllUsers()

  for (const user of users) {
    const favorites = getUserFavorites(user.id)
    if (favorites.length === 0) continue

    // Group favorites by source to know which parsers to use
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
      const results = await registry.searchCombined(paramsList)
      for (const listing of results) {
        upsertListing(listing)
      }
    } catch (error) {
      console.error('Failed to refresh prices:', error)
    }
  }
}
