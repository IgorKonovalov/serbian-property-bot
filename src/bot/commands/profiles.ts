import { Telegraf, Markup } from 'telegraf'
import { findOrCreateUser } from '../../db/queries/users'
import {
  getUserProfiles,
  createProfile,
  deleteProfile,
  updateProfile,
  getProfileById,
} from '../../db/queries/search-profiles'
import { startSearchWithProfiles } from './search'
import { messages } from '../messages'
import { escapeHtml } from '../../utils'

interface ProfileState {
  action:
    | 'add_name'
    | 'add_keywords'
    | 'add_filters'
    | 'edit_name'
    | 'edit_keywords'
    | 'edit_filters'
  profileId?: number
  name?: string
  keywords?: string
}

const userStates = new Map<number, ProfileState>()

function buildProfileListKeyboard(
  userId: number
): ReturnType<typeof Markup.inlineKeyboard> {
  const profiles = getUserProfiles(userId)
  const buttons = profiles.map((p) => [
    Markup.button.callback(`📌 ${p.name}`, `prof_view_${p.id}`),
  ])

  buttons.push([Markup.button.callback(messages.profilesAdd, 'prof_add')])

  return Markup.inlineKeyboard(buttons)
}

function parseFilters(text: string): {
  minPrice?: number
  maxPrice?: number
  minSize?: number
  maxSize?: number
  minPlotSize?: number
} {
  if (text.trim() === '-') return {}

  const parts = text.split(',').map((s) => s.trim())
  const result: ReturnType<typeof parseFilters> = {}

  if (parts[0]) {
    const [from, to] = parts[0].split('-').map((s) => parseInt(s.trim(), 10))
    if (!isNaN(from)) result.minPrice = from
    if (!isNaN(to)) result.maxPrice = to
  }
  if (parts[1]) {
    const [from, to] = parts[1].split('-').map((s) => parseInt(s.trim(), 10))
    if (!isNaN(from)) result.minSize = from
    if (!isNaN(to)) result.maxSize = to
  }
  if (parts[2]) {
    const val = parseInt(parts[2].trim(), 10)
    if (!isNaN(val)) result.minPlotSize = val
  }

  return result
}

function cancelKeyboard(): ReturnType<typeof Markup.inlineKeyboard> {
  return Markup.inlineKeyboard([
    [Markup.button.callback(messages.profilesCancel, 'prof_cancel')],
  ])
}

export function registerProfilesCommand(bot: Telegraf): void {
  bot.command('profiles', async (ctx) => {
    const user = findOrCreateUser(ctx.from.id, ctx.from.username)
    const profiles = getUserProfiles(user.id)

    if (profiles.length === 0) {
      await ctx.reply(messages.profilesEmpty, buildProfileListKeyboard(user.id))
    } else {
      await ctx.reply(messages.profilesList, buildProfileListKeyboard(user.id))
    }
  })

  // View profile details
  bot.action(/^prof_view_(\d+)$/, async (ctx) => {
    const user = findOrCreateUser(ctx.from.id, ctx.from.username)
    const profileId = parseInt(ctx.match[1], 10)
    const profile = getProfileById(profileId, user.id)

    if (!profile) {
      await ctx.answerCbQuery(messages.profilesNotFound)
      return
    }

    await ctx.editMessageText(messages.formatProfile(profile), {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            messages.profilesRun,
            `prof_run_${profile.id}`
          ),
          Markup.button.callback(
            messages.profilesEdit,
            `prof_edit_${profile.id}`
          ),
          Markup.button.callback(
            messages.profilesDelete,
            `prof_del_${profile.id}`
          ),
        ],
        [Markup.button.callback(messages.profilesBack, 'prof_list')],
      ]),
    })
    await ctx.answerCbQuery()
  })

  // Back to list
  bot.action('prof_list', async (ctx) => {
    const user = findOrCreateUser(ctx.from.id, ctx.from.username)
    const profiles = getUserProfiles(user.id)
    const text =
      profiles.length === 0 ? messages.profilesEmpty : messages.profilesList

    await ctx.editMessageText(text, buildProfileListKeyboard(user.id))
    await ctx.answerCbQuery()
  })

  // Delete profile — show confirmation
  bot.action(/^prof_del_(\d+)$/, async (ctx) => {
    const user = findOrCreateUser(ctx.from.id, ctx.from.username)
    const profileId = parseInt(ctx.match[1], 10)
    const profile = getProfileById(profileId, user.id)

    if (!profile) {
      await ctx.answerCbQuery(messages.profilesNotFound)
      return
    }

    await ctx.editMessageText(messages.profilesConfirmDelete(profile.name), {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            messages.profilesConfirmDeleteYes,
            `prof_delok_${profileId}`
          ),
          Markup.button.callback(messages.buttonCancel, 'prof_list'),
        ],
      ]),
    })
    await ctx.answerCbQuery()
  })

  // Confirm delete
  bot.action(/^prof_delok_(\d+)$/, async (ctx) => {
    const user = findOrCreateUser(ctx.from.id, ctx.from.username)
    const profileId = parseInt(ctx.match[1], 10)
    deleteProfile(profileId, user.id)

    await ctx.editMessageText(
      messages.profilesDeleted,
      buildProfileListKeyboard(user.id)
    )
    await ctx.answerCbQuery()
  })

  // Run search from profile
  bot.action(/^prof_run_(\d+)$/, async (ctx) => {
    const user = findOrCreateUser(ctx.from.id, ctx.from.username)
    const profileId = parseInt(ctx.match[1], 10)
    const profiles = getUserProfiles(user.id)

    startSearchWithProfiles(ctx.from.id, profiles, [profileId])

    await ctx.editMessageText(messages.searchEnterArea)
    await ctx.answerCbQuery()
  })

  // Start adding profile
  bot.action('prof_add', async (ctx) => {
    userStates.set(ctx.from.id, { action: 'add_name' })
    await ctx.editMessageText(messages.profilesEnterName, cancelKeyboard())
    await ctx.answerCbQuery()
  })

  // Cancel wizard
  bot.action('prof_cancel', async (ctx) => {
    userStates.delete(ctx.from.id)
    const user = findOrCreateUser(ctx.from.id, ctx.from.username)

    await ctx.editMessageText(
      messages.profilesCancelled,
      buildProfileListKeyboard(user.id)
    )
    await ctx.answerCbQuery()
  })

  // Start editing profile
  bot.action(/^prof_edit_(\d+)$/, async (ctx) => {
    const profileId = parseInt(ctx.match[1], 10)

    await ctx.editMessageText(
      messages.profilesEditWhat,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            messages.profilesEditName,
            `prof_editn_${profileId}`
          ),
          Markup.button.callback(
            messages.profilesEditKeywords,
            `prof_editk_${profileId}`
          ),
        ],
        [
          Markup.button.callback(
            messages.profilesEditFilters,
            `prof_editf_${profileId}`
          ),
        ],
        [Markup.button.callback(messages.profilesBack, 'prof_list')],
      ])
    )
    await ctx.answerCbQuery()
  })

  bot.action(/^prof_editn_(\d+)$/, async (ctx) => {
    userStates.set(ctx.from.id, {
      action: 'edit_name',
      profileId: parseInt(ctx.match[1], 10),
    })
    await ctx.editMessageText(messages.profilesEnterName, cancelKeyboard())
    await ctx.answerCbQuery()
  })

  bot.action(/^prof_editk_(\d+)$/, async (ctx) => {
    const user = findOrCreateUser(ctx.from.id, ctx.from.username)
    const profileId = parseInt(ctx.match[1], 10)
    const profile = getProfileById(profileId, user.id)
    userStates.set(ctx.from.id, {
      action: 'edit_keywords',
      profileId,
    })
    await ctx.editMessageText(
      `Текущие ключевые слова: "${escapeHtml(profile?.keywords ?? '')}"\nВведите новые:`,
      cancelKeyboard()
    )
    await ctx.answerCbQuery()
  })

  bot.action(/^prof_editf_(\d+)$/, async (ctx) => {
    userStates.set(ctx.from.id, {
      action: 'edit_filters',
      profileId: parseInt(ctx.match[1], 10),
    })
    await ctx.editMessageText(messages.profilesEnterFilters, cancelKeyboard())
    await ctx.answerCbQuery()
  })

  // Handle text input for add/edit flows
  bot.on('text', async (ctx, next) => {
    const state = userStates.get(ctx.from.id)
    if (!state) return next()

    const user = findOrCreateUser(ctx.from.id, ctx.from.username)
    const text = ctx.message.text.trim()

    switch (state.action) {
      case 'add_name':
        state.name = text
        state.action = 'add_keywords'
        await ctx.reply(messages.profilesEnterKeywords(text), cancelKeyboard())
        break

      case 'add_keywords':
        state.keywords = text === '-' ? state.name! : text
        state.action = 'add_filters'
        await ctx.reply(messages.profilesEnterFilters, cancelKeyboard())
        break

      case 'add_filters': {
        const filters = parseFilters(text)
        createProfile(user.id, state.name!, state.keywords!, filters)
        userStates.delete(ctx.from.id)
        await ctx.reply(
          messages.profilesCreated,
          buildProfileListKeyboard(user.id)
        )
        break
      }

      case 'edit_name':
        updateProfile(state.profileId!, user.id, { name: text })
        userStates.delete(ctx.from.id)
        await ctx.reply(
          messages.profilesUpdated,
          buildProfileListKeyboard(user.id)
        )
        break

      case 'edit_keywords':
        updateProfile(state.profileId!, user.id, { keywords: text })
        userStates.delete(ctx.from.id)
        await ctx.reply(
          messages.profilesUpdated,
          buildProfileListKeyboard(user.id)
        )
        break

      case 'edit_filters': {
        const filters = parseFilters(text)
        updateProfile(state.profileId!, user.id, {
          minPrice: filters.minPrice ?? null,
          maxPrice: filters.maxPrice ?? null,
          minSize: filters.minSize ?? null,
          maxSize: filters.maxSize ?? null,
          minPlotSize: filters.minPlotSize ?? null,
        })
        userStates.delete(ctx.from.id)
        await ctx.reply(
          messages.profilesUpdated,
          buildProfileListKeyboard(user.id)
        )
        break
      }

      default:
        return next()
    }
  })
}
