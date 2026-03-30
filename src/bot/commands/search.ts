import { Telegraf, Markup } from 'telegraf'
import type { InlineKeyboardButton, InlineKeyboardMarkup } from 'telegraf/types'
import { findOrCreateUser } from '../../db/queries/users'
import {
  getUserProfiles,
  type DbSearchProfile,
} from '../../db/queries/search-profiles'
import { upsertListing } from '../../db/queries/listings'
import { addFavorite } from '../../db/queries/favorites'
import { getDatabase } from '../../db/database'
import type { ParserRegistry } from '../../parsers/registry'
import type { Listing, SearchParams } from '../../parsers/types'
import { messages } from '../messages'

interface SearchState {
  selectedProfileIds: Set<number>
  profiles: DbSearchProfile[]
  results?: Listing[]
  page: number
}

const RESULTS_PER_PAGE = 5

const userStates = new Map<number, SearchState>()

function buildProfileKeyboard(
  state: SearchState
): ReturnType<typeof Markup.inlineKeyboard> {
  const buttons = state.profiles.map((p) => {
    const selected = state.selectedProfileIds.has(p.id)
    const label = `${selected ? '✓' : '✗'} ${p.name}`
    return [Markup.button.callback(label, `search_toggle_${p.id}`)]
  })

  buttons.push([Markup.button.callback(messages.buttonSearch, 'search_run')])

  return Markup.inlineKeyboard(buttons)
}

function buildResultsKeyboard(
  results: Listing[],
  page: number
): { reply_markup: InlineKeyboardMarkup } {
  const start = page * RESULTS_PER_PAGE
  const pageResults = results.slice(start, start + RESULTS_PER_PAGE)
  const totalPages = Math.ceil(results.length / RESULTS_PER_PAGE)

  const rows: InlineKeyboardButton[][] = []

  // Each listing gets a row with detail number button and save button
  pageResults.forEach((listing, i) => {
    rows.push([
      {
        text: `📷 ${start + i + 1}`,
        callback_data: `detail_${start + i}`,
      } as InlineKeyboardButton.CallbackButton,
      {
        text: messages.buttonSave,
        callback_data: `save_${listing.source}_${listing.externalId}`,
      } as InlineKeyboardButton.CallbackButton,
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

function buildResultsMessage(results: Listing[], page: number): string {
  const start = page * RESULTS_PER_PAGE
  const end = Math.min(start + RESULTS_PER_PAGE, results.length)
  const pageResults = results.slice(start, end)

  const header = messages.resultHeader(start + 1, end, results.length) + '\n\n'
  const listings = pageResults
    .map((l, i) =>
      messages.resultCard(
        start + i + 1,
        l.rooms,
        l.size,
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

export function registerSearchCommand(
  bot: Telegraf,
  registry: ParserRegistry
): void {
  bot.command('search', async (ctx) => {
    const telegramId = ctx.from.id
    const user = findOrCreateUser(telegramId, ctx.from.username)
    const profiles = getUserProfiles(user.id)

    if (profiles.length === 0) {
      await ctx.reply(messages.searchNoProfiles)
      return
    }

    const state: SearchState = {
      selectedProfileIds: new Set(),
      profiles,
      page: 0,
    }
    userStates.set(telegramId, state)

    await ctx.reply(messages.searchSelectProfiles, buildProfileKeyboard(state))
  })

  // Toggle profile selection
  bot.action(/^search_toggle_(\d+)$/, async (ctx) => {
    const telegramId = ctx.from.id
    const state = userStates.get(telegramId)
    if (!state) {
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

    await ctx.editMessageText(messages.searchEnterArea)
    await ctx.answerCbQuery()
  })

  // Listen for area text input after profile selection
  bot.on('text', async (ctx, next) => {
    const telegramId = ctx.from.id
    const state = userStates.get(telegramId)

    if (!state || state.selectedProfileIds.size === 0 || state.results) {
      return next()
    }

    const area = ctx.message.text.trim()

    const paramsList: SearchParams[] = state.profiles
      .filter((p) => state.selectedProfileIds.has(p.id))
      .map((p) => ({
        keywords: p.keywords,
        area,
        minPrice: p.min_price ?? undefined,
        maxPrice: p.max_price ?? undefined,
        minSize: p.min_size ?? undefined,
        maxSize: p.max_size ?? undefined,
        minPlotSize: p.min_plot_size ?? undefined,
      }))

    await ctx.reply(messages.searchSearching)

    try {
      const results = await registry.searchCombined(paramsList)

      for (const listing of results) {
        upsertListing(listing)
      }

      state.results = results
      state.page = 0

      if (results.length === 0) {
        await ctx.reply(messages.searchNoResults)
        userStates.delete(telegramId)
        return
      }

      await ctx.reply(buildResultsMessage(results, 0), {
        ...buildResultsKeyboard(results, 0),
        parse_mode: 'HTML',
      })
    } catch (error) {
      console.error('Search failed:', error)
      await ctx.reply(messages.searchFailed)
      userStates.delete(telegramId)
    }
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
      ...buildResultsKeyboard(state.results, page),
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
      ...buildResultsKeyboard(state.results, page),
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

    const backButton: InlineKeyboardButton.CallbackButton = {
      text: messages.buttonBackToList,
      callback_data: `sback_${state.page}`,
    }
    const saveButton: InlineKeyboardButton.CallbackButton = {
      text: messages.buttonSave,
      callback_data: `save_${listing.source}_${listing.externalId}`,
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

  // Save to favorites
  bot.action(/^save_(.+)_(.+)$/, async (ctx) => {
    const telegramId = ctx.from.id
    const user = findOrCreateUser(telegramId, ctx.from.username)

    const source = ctx.match[1]
    const externalId = ctx.match[2]

    const db = getDatabase()
    const listing = db
      .prepare('SELECT id FROM listings WHERE source = ? AND external_id = ?')
      .get(source, externalId) as { id: number } | undefined

    if (!listing) {
      await ctx.answerCbQuery(messages.searchListingNotFound)
      return
    }

    addFavorite(user.id, listing.id)
    await ctx.answerCbQuery(messages.searchSaved)
  })
}
