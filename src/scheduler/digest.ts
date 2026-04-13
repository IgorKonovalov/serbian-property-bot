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
import { escapeUrl } from '../utils'
import { TTLMap } from '../bot/state-manager'
import { config } from '../config'
import { createLogger } from '../logger'

const log = createLogger('digest')

const PER_PAGE = config.resultsPerPage

// --- Price filter buckets ---

export type PriceBucket = 'all' | 'lt50' | '50_100' | '100_200' | 'gt200'

export const PRICE_BUCKETS: { key: PriceBucket; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'lt50', label: '< €50k' },
  { key: '50_100', label: '€50-100k' },
  { key: '100_200', label: '€100-200k' },
  { key: 'gt200', label: '€200k+' },
]

function matchesBucket(price: number | null, bucket: PriceBucket): boolean {
  if (bucket === 'all') return true
  if (price === null) return false
  switch (bucket) {
    case 'lt50':
      return price < 50000
    case '50_100':
      return price >= 50000 && price < 100000
    case '100_200':
      return price >= 100000 && price < 200000
    case 'gt200':
      return price >= 200000
  }
}

export function filterByBucket(
  listings: Listing[],
  bucket: PriceBucket
): Listing[] {
  if (bucket === 'all') return listings
  return listings.filter((l) => matchesBucket(l.price, bucket))
}

function bucketLabel(bucket: PriceBucket): string {
  return PRICE_BUCKETS.find((b) => b.key === bucket)?.label ?? 'Все'
}

// --- Formatting ---

function formatPriceChange(pc: PriceChange): string {
  const pctChange = ((pc.new_price - pc.old_price) / pc.old_price) * 100
  const direction = pctChange > 0 ? '📈' : '📉'
  const sign = pctChange > 0 ? '+' : ''
  const location = [pc.city, pc.area].filter(Boolean).join(', ')

  return (
    `${direction} ${pc.title ?? 'Без названия'}\n` +
    `💰 €${pc.old_price.toLocaleString('ru-RU')} → €${pc.new_price.toLocaleString('ru-RU')} (${sign}${pctChange.toFixed(1)}%)\n` +
    `📍 ${location || 'Н/Д'}\n` +
    `🔗 <a href="${escapeUrl(pc.url)}">${pc.source}</a>`
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
    `   📍 ${location || 'Н/Д'} | <a href="${escapeUrl(l.url)}">${l.source}</a>`
  )
}

// --- Digest data ---

export interface DigestData {
  priceChanges: PriceChange[]
  newListings: Listing[]
  hasFavorites: boolean
}

export interface DigestState {
  data: DigestData
  newPage: number
  pricePage: number
  priceBucket: PriceBucket
}

/** Shared cache — written by both scheduler and /digest command, read by callbacks */
export const digestCache = new TTLMap<number, DigestState>(12 * 60 * 60 * 1000)

export async function buildDigestData(
  userId: number,
  registry: ParserRegistry
): Promise<DigestData> {
  const priceChanges = getPriceChangesForUser(userId)
  const hasFavorites = getUserFavorites(userId).length > 0

  const profiles = getUserProfiles(userId).filter((p) => p.is_active)
  const newListings: Listing[] = []

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
        const { isNew } = upsertListing(listing)
        if (isNew) {
          newListings.push(listing)
        }
      }
    } catch (error) {
      log.error('Digest scrape failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { priceChanges, newListings, hasFavorites }
}

// --- Summary ---

export function buildDigestSummary(data: DigestData): {
  text: string
  keyboard: InlineKeyboardMarkup
} {
  const { priceChanges, newListings, hasFavorites } = data

  const today = new Date()
  const dateStr = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}`

  const lines: string[] = [messages.digestSummaryTitle]
  lines.push(`🆕 Новых: ${newListings.length}`)

  if (hasFavorites) {
    lines.push(
      priceChanges.length > 0
        ? `⭐ Изменения в избранном: ${priceChanges.length}`
        : '⭐ Изменения в избранном: 0'
    )
  } else {
    lines.push('⭐ Нет сохранённых объявлений')
  }

  const buttons: InlineKeyboardButton.CallbackButton[][] = [
    [
      {
        text: messages.digestNewButton(newListings.length, dateStr),
        callback_data: 'digest_new',
      },
    ],
    [
      {
        text: hasFavorites
          ? messages.digestFavButton(priceChanges.length)
          : messages.digestNoFavorites,
        callback_data: hasFavorites ? 'digest_fav' : 'digest_nofav',
      },
    ],
  ]

  return {
    text: lines.join('\n'),
    keyboard: { inline_keyboard: buttons },
  }
}

// --- Paginated message builders ---

export function buildNewListingsPage(
  listings: Listing[],
  page: number,
  bucket: PriceBucket
): { text: string; keyboard: InlineKeyboardMarkup } {
  const filtered = filterByBucket(listings, bucket)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const safePage = Math.min(Math.max(0, page), totalPages - 1)
  const start = safePage * PER_PAGE
  const pageItems = filtered.slice(start, start + PER_PAGE)

  const header =
    bucket === 'all'
      ? messages.digestNewTitle
      : `🆕 <b>Новые (${bucketLabel(bucket)}):</b>\n\n`

  const body =
    pageItems.length > 0
      ? pageItems.map((l, i) => formatNewListing(l, start + i)).join('\n\n')
      : 'Нет объявлений в этом диапазоне.'

  const footer = `\n\n${messages.digestPage(safePage + 1, totalPages, filtered.length)}`

  const rows: InlineKeyboardButton.CallbackButton[][] = []

  // Filter row
  rows.push(
    PRICE_BUCKETS.map((b) => ({
      text: b.key === bucket ? `[${b.label}]` : b.label,
      callback_data: `dflt_${b.key}`,
    }))
  )

  // Navigation row
  const nav: InlineKeyboardButton.CallbackButton[] = []
  if (safePage > 0) {
    nav.push({
      text: messages.buttonPrev,
      callback_data: `dpage_new_${safePage - 1}`,
    })
  }
  if (safePage < totalPages - 1) {
    nav.push({
      text: messages.buttonNext,
      callback_data: `dpage_new_${safePage + 1}`,
    })
  }
  if (nav.length > 0) rows.push(nav)

  // Back button
  rows.push([
    { text: messages.buttonBackToDigest, callback_data: 'digest_back' },
  ])

  return {
    text: header + body + footer,
    keyboard: { inline_keyboard: rows },
  }
}

export function buildPriceChangesPage(
  changes: PriceChange[],
  page: number
): { text: string; keyboard: InlineKeyboardMarkup } {
  const totalPages = Math.max(1, Math.ceil(changes.length / PER_PAGE))
  const safePage = Math.min(Math.max(0, page), totalPages - 1)
  const start = safePage * PER_PAGE
  const pageItems = changes.slice(start, start + PER_PAGE)

  const body = pageItems.map(formatPriceChange).join('\n\n')
  const footer = `\n\n${messages.digestPage(safePage + 1, totalPages, changes.length)}`

  const rows: InlineKeyboardButton.CallbackButton[][] = []

  // Navigation row
  const nav: InlineKeyboardButton.CallbackButton[] = []
  if (safePage > 0) {
    nav.push({
      text: messages.buttonPrev,
      callback_data: `dpage_price_${safePage - 1}`,
    })
  }
  if (safePage < totalPages - 1) {
    nav.push({
      text: messages.buttonNext,
      callback_data: `dpage_price_${safePage + 1}`,
    })
  }
  if (nav.length > 0) rows.push(nav)

  // Back button
  rows.push([
    { text: messages.buttonBackToDigest, callback_data: 'digest_back' },
  ])

  return {
    text: messages.digestFavTitle + body + footer,
    keyboard: { inline_keyboard: rows },
  }
}

// --- Legacy compat for tests (simple string builders) ---

export function buildNewListingsMessage(listings: Listing[]): string {
  return buildNewListingsPage(listings, 0, 'all').text
}

export function buildPriceChangesMessage(changes: PriceChange[]): string {
  return buildPriceChangesPage(changes, 0).text
}

// --- Scheduler entry points ---

export async function sendDigestToAll(
  bot: Telegraf,
  registry: ParserRegistry
): Promise<void> {
  const users = getAllUsers()

  for (const user of users) {
    try {
      const data = await buildDigestData(user.id, registry)
      const summary = buildDigestSummary(data)

      // Cache data so callback buttons work
      digestCache.set(user.telegram_id, {
        data,
        newPage: 0,
        pricePage: 0,
        priceBucket: 'all',
      })

      await bot.telegram.sendMessage(user.telegram_id, summary.text, {
        parse_mode: 'HTML',
        reply_markup: summary.keyboard,
      })
      log.info('Digest sent', { telegramId: user.telegram_id })
    } catch (error) {
      log.error('Failed to send digest', {
        telegramId: user.telegram_id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

const MAX_FAVORITES_PER_REFRESH = 20

export async function refreshFavoritePrices(
  bot: Telegraf,
  registry: ParserRegistry
): Promise<void> {
  const users = getAllUsers()

  for (const user of users) {
    const favorites = getUserFavorites(user.id).slice(
      0,
      MAX_FAVORITES_PER_REFRESH
    )
    if (favorites.length === 0) continue

    log.info('Refreshing favorites', {
      telegramId: user.telegram_id,
      count: favorites.length,
    })

    for (const fav of favorites) {
      try {
        const listing = await registry.fetchByUrl(fav.url, fav.source)
        if (listing) {
          upsertListing(listing)
        }
      } catch (error) {
        log.error('Failed to refresh favorite', {
          listingId: fav.listing_id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }
}
