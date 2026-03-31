import { Telegraf, Markup } from 'telegraf'
import type { InlineKeyboardButton, InlineKeyboardMarkup } from 'telegraf/types'
import { findOrCreateUser } from '../../db/queries/users'
import {
  getUserProfiles,
  type DbSearchProfile,
} from '../../db/queries/search-profiles'
import { upsertListing } from '../../db/queries/listings'
import { addFavorite } from '../../db/queries/favorites'
import { getEnabledSites } from '../../db/queries/user-settings'
import type { ParserRegistry } from '../../parsers/registry'
import type { Listing, SearchParams } from '../../parsers/types'
import { messages } from '../messages'

interface SearchResult extends Listing {
  dbId: number
}

type SortOrder = 'asc' | 'desc'

interface SearchState {
  phase:
    | 'selecting'
    | 'entering_area'
    | 'entering_price'
    | 'choosing_sort'
    | 'browsing'
  selectedProfileIds: Set<number>
  profiles: DbSearchProfile[]
  area?: string
  minPrice?: number
  maxPrice?: number
  sortOrder: SortOrder
  results?: SearchResult[]
  savedIds: Set<number>
  page: number
}

const RESULTS_PER_PAGE = 5

const userStates = new Map<number, SearchState>()

export function startSearchWithProfiles(
  telegramId: number,
  profiles: DbSearchProfile[],
  selectedIds: number[]
): SearchState {
  const state: SearchState = {
    phase: 'entering_area',
    selectedProfileIds: new Set(selectedIds),
    profiles,
    sortOrder: 'asc',
    savedIds: new Set(),
    page: 0,
  }
  userStates.set(telegramId, state)
  return state
}

export function startSearchFromMenu(
  telegramId: number,
  profiles: DbSearchProfile[]
): void {
  const state: SearchState = {
    phase: 'selecting',
    selectedProfileIds: new Set(),
    profiles,
    sortOrder: 'asc',
    savedIds: new Set(),
    page: 0,
  }
  userStates.set(telegramId, state)
}

function buildProfileKeyboard(
  state: SearchState
): ReturnType<typeof Markup.inlineKeyboard> {
  const buttons = state.profiles.map((p) => {
    const selected = state.selectedProfileIds.has(p.id)
    const label = `${selected ? '✅' : '◻️'} ${p.name}`
    return [Markup.button.callback(label, `search_toggle_${p.id}`)]
  })

  buttons.push([Markup.button.callback(messages.buttonSearch, 'search_run')])

  return Markup.inlineKeyboard(buttons)
}

function buildResultsKeyboard(
  results: SearchResult[],
  page: number,
  savedIds: Set<number>
): { reply_markup: InlineKeyboardMarkup } {
  const start = page * RESULTS_PER_PAGE
  const pageResults = results.slice(start, start + RESULTS_PER_PAGE)
  const totalPages = Math.ceil(results.length / RESULTS_PER_PAGE)

  const rows: InlineKeyboardButton[][] = []

  pageResults.forEach((listing, i) => {
    const isSaved = savedIds.has(listing.dbId)
    rows.push([
      {
        text: `📷 ${start + i + 1}`,
        callback_data: `detail_${start + i}`,
      } as InlineKeyboardButton.CallbackButton,
      isSaved
        ? ({
            text: messages.buttonSaved,
            callback_data: `saved_${listing.dbId}`,
          } as InlineKeyboardButton.CallbackButton)
        : ({
            text: messages.buttonSave,
            callback_data: `save_${listing.dbId}`,
          } as InlineKeyboardButton.CallbackButton),
    ])
  })

  const navRow: InlineKeyboardButton.CallbackButton[] = []
  if (page > 0) {
    navRow.push({
      text: messages.buttonPrev,
      callback_data: `spage_${page - 1}`,
    })
  }
  if (page < totalPages - 1) {
    navRow.push({
      text: messages.buttonNext,
      callback_data: `spage_${page + 1}`,
    })
  }
  if (navRow.length > 0) {
    rows.push(navRow)
  }

  return { reply_markup: { inline_keyboard: rows } }
}

function buildResultsMessage(results: SearchResult[], page: number): string {
  const start = page * RESULTS_PER_PAGE
  const end = Math.min(start + RESULTS_PER_PAGE, results.length)
  const pageResults = results.slice(start, end)

  const header = messages.resultHeader(start + 1, end, results.length) + '\n\n'
  const listings = pageResults
    .map((l, i) =>
      messages.resultCard(
        start + i + 1,
        l.title,
        l.rooms,
        l.size,
        l.plotSize,
        l.price,
        l.city,
        l.area,
        l.source,
        l.url
      )
    )
    .join('\n\n')

  return header + listings
}

async function runSearch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: {
    from: { id: number; username?: string }
    reply: (...args: any[]) => Promise<any>
  },
  telegramId: number,
  state: SearchState,
  registry: ParserRegistry
): Promise<void> {
  const area = state.area ?? ''
  const paramsList: SearchParams[] = state.profiles
    .filter((p) => state.selectedProfileIds.has(p.id))
    .map((p) => ({
      keywords: p.keywords,
      area,
      minPrice: state.minPrice ?? p.min_price ?? undefined,
      maxPrice: state.maxPrice ?? p.max_price ?? undefined,
      minSize: p.min_size ?? undefined,
      maxSize: p.max_size ?? undefined,
      minPlotSize: p.min_plot_size ?? undefined,
    }))

  state.phase = 'browsing'
  const profileNames = state.profiles
    .filter((p) => state.selectedProfileIds.has(p.id))
    .map((p) => p.name)
  console.log(
    `[search] User ${telegramId} | area="${area}" | price=${state.minPrice ?? '?'}-${state.maxPrice ?? '?'} | sort=${state.sortOrder} | profiles: ${profileNames.join(', ')}`
  )
  await ctx.reply(messages.searchSearching)

  try {
    const user = findOrCreateUser(telegramId, ctx.from.username)
    const enabledSources = getEnabledSites(user.id, registry.registeredSources)
    console.log(`[search] Enabled sources: ${enabledSources.join(', ')}`)
    const startTime = Date.now()
    const rawResults = await registry.searchCombined(paramsList, enabledSources)
    console.log(
      `[search] Done: ${rawResults.length} total results (${Date.now() - startTime}ms)`
    )

    const results: SearchResult[] = rawResults.map((listing) => {
      const dbListing = upsertListing(listing)
      return { ...listing, dbId: dbListing.id }
    })

    // Sort by price
    results.sort((a, b) => {
      const pa = a.price ?? (state.sortOrder === 'asc' ? Infinity : -Infinity)
      const pb = b.price ?? (state.sortOrder === 'asc' ? Infinity : -Infinity)
      return state.sortOrder === 'asc' ? pa - pb : pb - pa
    })

    state.results = results
    state.page = 0

    if (results.length === 0) {
      await ctx.reply(messages.searchNoResults, {
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔍 Новый поиск', 'search_restart')],
        ]),
      })
      userStates.delete(telegramId)
      return
    }

    await ctx.reply(buildResultsMessage(results, 0), {
      ...buildResultsKeyboard(results, 0, state.savedIds),
      parse_mode: 'HTML',
    })
  } catch (error) {
    console.error('Search failed:', error)
    await ctx.reply(messages.searchFailed)
    userStates.delete(telegramId)
  }
}

export function registerSearchCommand(
  bot: Telegraf,
  registry: ParserRegistry
): void {
  bot.command('search', async (ctx) => {
    const telegramId = ctx.from.id
    const user = findOrCreateUser(telegramId, ctx.from.username)
    const profiles = getUserProfiles(user.id)

    if (profiles.length === 0) {
      await ctx.reply(messages.searchNoProfiles, {
        ...Markup.inlineKeyboard([
          [Markup.button.callback(messages.buttonCreateProfile, 'prof_add')],
        ]),
      })
      return
    }

    const state: SearchState = {
      phase: 'selecting',
      selectedProfileIds: new Set(),
      profiles,
      sortOrder: 'asc',
      savedIds: new Set(),
      page: 0,
    }
    userStates.set(telegramId, state)

    await ctx.reply(messages.searchSelectProfiles, buildProfileKeyboard(state))
  })

  // Toggle profile selection
  bot.action(/^search_toggle_(\d+)$/, async (ctx) => {
    const telegramId = ctx.from.id
    const state = userStates.get(telegramId)
    if (!state || state.phase !== 'selecting') {
      await ctx.answerCbQuery(messages.searchSessionExpired)
      return
    }

    const profileId = parseInt(ctx.match[1], 10)
    if (state.selectedProfileIds.has(profileId)) {
      state.selectedProfileIds.delete(profileId)
    } else {
      state.selectedProfileIds.add(profileId)
    }

    await ctx.editMessageReplyMarkup(buildProfileKeyboard(state).reply_markup)
    await ctx.answerCbQuery()
  })

  // Run search — ask for area
  bot.action('search_run', async (ctx) => {
    const telegramId = ctx.from.id
    const state = userStates.get(telegramId)
    if (!state) {
      await ctx.answerCbQuery(messages.searchSessionExpired)
      return
    }

    if (state.selectedProfileIds.size === 0) {
      await ctx.answerCbQuery(messages.searchSelectAtLeast)
      return
    }

    state.phase = 'entering_area'
    await ctx.editMessageText(messages.searchEnterArea)
    await ctx.answerCbQuery()
  })

  // Listen for text input — area and price phases
  bot.on('text', async (ctx, next) => {
    const telegramId = ctx.from.id
    const state = userStates.get(telegramId)

    if (!state) return next()

    // Phase: entering area
    if (state.phase === 'entering_area') {
      state.area = ctx.message.text.trim()
      state.phase = 'entering_price'
      await ctx.reply(messages.searchEnterPrice)
      return
    }

    // Phase: entering price range
    if (state.phase === 'entering_price') {
      const text = ctx.message.text.trim()
      if (text !== '-') {
        const match = text.match(/^(\d+)?\s*[-–—]\s*(\d+)?$|^(\d+)$/)
        if (match) {
          const min = match[1] ? parseInt(match[1], 10) : undefined
          const max = match[2] ? parseInt(match[2], 10) : undefined
          const single = match[3] ? parseInt(match[3], 10) : undefined
          if (single) {
            state.maxPrice = single
          } else {
            state.minPrice = min
            state.maxPrice = max
          }
        } else {
          await ctx.reply(messages.searchPriceInvalid)
          return
        }
      }
      state.phase = 'choosing_sort'
      await ctx.reply(
        messages.searchChooseSort,
        Markup.inlineKeyboard([
          [
            Markup.button.callback('↑ Сначала дешёвые', 'sort_asc'),
            Markup.button.callback('↓ Сначала дорогие', 'sort_desc'),
          ],
        ])
      )
      return
    }

    return next()
  })

  // Sort selection → run search
  bot.action(/^sort_(asc|desc)$/, async (ctx) => {
    const telegramId = ctx.from.id
    const state = userStates.get(telegramId)
    if (!state || state.phase !== 'choosing_sort') {
      await ctx.answerCbQuery(messages.searchSessionExpired)
      return
    }

    state.sortOrder = ctx.match[1] as SortOrder
    await ctx.answerCbQuery()
    await runSearch(ctx, telegramId, state, registry)
  })

  // Pagination
  bot.action(/^spage_(\d+)$/, async (ctx) => {
    const telegramId = ctx.from.id
    const state = userStates.get(telegramId)
    if (!state?.results) {
      await ctx.answerCbQuery(messages.searchSessionExpired)
      return
    }

    const page = parseInt(ctx.match[1], 10)
    state.page = page

    await ctx.editMessageText(buildResultsMessage(state.results, page), {
      ...buildResultsKeyboard(state.results, page, state.savedIds),
      parse_mode: 'HTML',
    })
    await ctx.answerCbQuery()
  })

  // Back to list from detail view (sends new message since detail may be a photo)
  bot.action(/^sback_(\d+)$/, async (ctx) => {
    const telegramId = ctx.from.id
    const state = userStates.get(telegramId)
    if (!state?.results) {
      await ctx.answerCbQuery(messages.searchSessionExpired)
      return
    }

    const page = parseInt(ctx.match[1], 10)
    state.page = page

    await ctx.reply(buildResultsMessage(state.results, page), {
      ...buildResultsKeyboard(state.results, page, state.savedIds),
      parse_mode: 'HTML',
    })
    await ctx.answerCbQuery()
  })

  // Detail view — show photo + details for a single listing
  bot.action(/^detail_(\d+)$/, async (ctx) => {
    const telegramId = ctx.from.id
    const state = userStates.get(telegramId)
    if (!state?.results) {
      await ctx.answerCbQuery(messages.searchSessionExpired)
      return
    }

    const index = parseInt(ctx.match[1], 10)
    const listing = state.results[index]
    if (!listing) {
      await ctx.answerCbQuery(messages.searchListingNotFound)
      return
    }

    const caption = messages.detailCaption(
      listing.title,
      listing.rooms,
      listing.size,
      listing.price,
      listing.city,
      listing.area,
      listing.plotSize,
      listing.source,
      listing.url
    )

    const isSaved = state.savedIds.has(listing.dbId)
    const backButton: InlineKeyboardButton.CallbackButton = {
      text: messages.buttonBackToList,
      callback_data: `sback_${state.page}`,
    }
    const saveButton: InlineKeyboardButton.CallbackButton = isSaved
      ? {
          text: messages.buttonSaved,
          callback_data: `saved_${listing.dbId}`,
        }
      : {
          text: messages.buttonSave,
          callback_data: `save_${listing.dbId}`,
        }
    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [[saveButton, backButton]],
    }

    try {
      if (listing.imageUrl) {
        await ctx.replyWithPhoto(listing.imageUrl, {
          caption,
          parse_mode: 'HTML',
          reply_markup: keyboard,
        })
      } else {
        await ctx.reply(caption, {
          parse_mode: 'HTML',
          reply_markup: keyboard,
        })
      }
    } catch {
      // Fallback to text if photo fails
      await ctx.reply(caption, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
      })
    }

    await ctx.answerCbQuery()
  })

  // Save to favorites (new format: save_{dbId})
  bot.action(/^save_(\d+)$/, async (ctx) => {
    const telegramId = ctx.from.id
    const user = findOrCreateUser(telegramId, ctx.from.username)
    const dbId = parseInt(ctx.match[1], 10)

    addFavorite(user.id, dbId)

    const state = userStates.get(telegramId)
    if (state) {
      state.savedIds.add(dbId)
      // Update keyboard to show "Saved" button
      if (state.results) {
        try {
          await ctx.editMessageReplyMarkup(
            buildResultsKeyboard(state.results, state.page, state.savedIds)
              .reply_markup
          )
        } catch {
          // May fail if this is a detail view (photo message) — that's ok
        }
      }
    }

    await ctx.answerCbQuery(messages.searchSaved)
  })

  // Already saved — no-op toast
  bot.action(/^saved_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery(messages.searchAlreadySaved)
  })

  // Restart search from "no results" screen
  bot.action('search_restart', async (ctx) => {
    const telegramId = ctx.from.id
    const user = findOrCreateUser(telegramId, ctx.from.username)
    const profiles = getUserProfiles(user.id)

    if (profiles.length === 0) {
      await ctx.answerCbQuery(messages.searchNoProfiles)
      return
    }

    const state: SearchState = {
      phase: 'selecting',
      selectedProfileIds: new Set(),
      profiles,
      sortOrder: 'asc',
      savedIds: new Set(),
      page: 0,
    }
    userStates.set(telegramId, state)

    await ctx.editMessageText(
      messages.searchSelectProfiles,
      buildProfileKeyboard(state)
    )
    await ctx.answerCbQuery()
  })
}
