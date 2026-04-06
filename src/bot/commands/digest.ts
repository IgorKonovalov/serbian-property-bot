import { Telegraf, Markup } from 'telegraf'
import { findOrCreateUser } from '../../db/queries/users'
import type { ParserRegistry } from '../../parsers/registry'
import {
  buildDigestData,
  buildDigestSummary,
  buildNewListingsPage,
  buildPriceChangesPage,
  digestCache,
  type PriceBucket,
} from '../../scheduler/digest'
import { messages } from '../messages'
import { createLogger } from '../../logger'

const log = createLogger('digest-cmd')

export function registerDigestCommand(
  bot: Telegraf,
  registry: ParserRegistry
): void {
  bot.command('digest', async (ctx) => {
    const user = findOrCreateUser(ctx.from.id, ctx.from.username)

    await ctx.reply(messages.digestLoading)

    try {
      const data = await buildDigestData(user.id, registry)
      const summary = buildDigestSummary(data)

      if (summary) {
        digestCache.set(ctx.from.id, {
          data,
          newPage: 0,
          pricePage: 0,
          priceBucket: 'all',
        })
        await ctx.reply(summary.text, {
          parse_mode: 'HTML',
          reply_markup: summary.keyboard,
        })
      } else {
        await ctx.reply(messages.digestEmpty, {
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                messages.buttonNewSearch,
                'search_restart'
              ),
            ],
          ]),
        })
      }
    } catch (error) {
      log.error('Digest command failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      await ctx.reply(messages.digestFailed, {
        ...Markup.inlineKeyboard([
          [Markup.button.callback(messages.buttonRetry, 'digest_retry')],
        ]),
      })
    }
  })

  // Show new listings (first page)
  bot.action('digest_new', async (ctx) => {
    const state = digestCache.get(ctx.from.id)
    if (!state || state.data.newListings.length === 0) {
      await ctx.answerCbQuery(messages.digestEmpty)
      return
    }

    state.newPage = 0
    state.priceBucket = 'all'
    const { text, keyboard } = buildNewListingsPage(
      state.data.newListings,
      0,
      'all'
    )
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    })
    await ctx.answerCbQuery()
  })

  // New listings pagination
  bot.action(/^dpage_new_(\d+)$/, async (ctx) => {
    const state = digestCache.get(ctx.from.id)
    if (!state) {
      await ctx.answerCbQuery(messages.digestEmpty)
      return
    }

    const page = parseInt(ctx.match[1], 10)
    state.newPage = page
    const { text, keyboard } = buildNewListingsPage(
      state.data.newListings,
      page,
      state.priceBucket
    )
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    })
    await ctx.answerCbQuery()
  })

  // Price filter
  bot.action(/^dflt_(.+)$/, async (ctx) => {
    const state = digestCache.get(ctx.from.id)
    if (!state) {
      await ctx.answerCbQuery(messages.digestEmpty)
      return
    }

    const bucket = ctx.match[1] as PriceBucket
    state.priceBucket = bucket
    state.newPage = 0
    const { text, keyboard } = buildNewListingsPage(
      state.data.newListings,
      0,
      bucket
    )
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    })
    await ctx.answerCbQuery()
  })

  // Show favorite price changes (first page)
  bot.action('digest_fav', async (ctx) => {
    const state = digestCache.get(ctx.from.id)
    if (!state || state.data.priceChanges.length === 0) {
      await ctx.answerCbQuery(messages.digestEmpty)
      return
    }

    state.pricePage = 0
    const { text, keyboard } = buildPriceChangesPage(state.data.priceChanges, 0)
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    })
    await ctx.answerCbQuery()
  })

  // Price changes pagination
  bot.action(/^dpage_price_(\d+)$/, async (ctx) => {
    const state = digestCache.get(ctx.from.id)
    if (!state) {
      await ctx.answerCbQuery(messages.digestEmpty)
      return
    }

    const page = parseInt(ctx.match[1], 10)
    state.pricePage = page
    const { text, keyboard } = buildPriceChangesPage(
      state.data.priceChanges,
      page
    )
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    })
    await ctx.answerCbQuery()
  })

  // Back to digest summary
  bot.action('digest_back', async (ctx) => {
    const state = digestCache.get(ctx.from.id)
    if (!state) {
      await ctx.answerCbQuery()
      return
    }
    const summary = buildDigestSummary(state.data)
    if (summary) {
      await ctx.editMessageText(summary.text, {
        parse_mode: 'HTML',
        reply_markup: summary.keyboard,
      })
    }
    await ctx.answerCbQuery()
  })

  // Retry digest
  bot.action('digest_retry', async (ctx) => {
    const user = findOrCreateUser(ctx.from.id, ctx.from.username)
    await ctx.answerCbQuery()
    await ctx.reply(messages.digestLoading)

    try {
      const data = await buildDigestData(user.id, registry)
      const summary = buildDigestSummary(data)

      if (summary) {
        digestCache.set(ctx.from.id, {
          data,
          newPage: 0,
          pricePage: 0,
          priceBucket: 'all',
        })
        await ctx.reply(summary.text, {
          parse_mode: 'HTML',
          reply_markup: summary.keyboard,
        })
      } else {
        await ctx.reply(messages.digestEmpty, {
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                messages.buttonNewSearch,
                'search_restart'
              ),
            ],
          ]),
        })
      }
    } catch (error) {
      log.error('Digest retry failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      await ctx.reply(messages.digestFailed, {
        ...Markup.inlineKeyboard([
          [Markup.button.callback(messages.buttonRetry, 'digest_retry')],
        ]),
      })
    }
  })
}
