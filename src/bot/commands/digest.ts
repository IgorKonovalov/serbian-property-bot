import { Telegraf } from 'telegraf'
import { findOrCreateUser } from '../../db/queries/users'
import type { ParserRegistry } from '../../parsers/registry'
import {
  buildDigestData,
  buildDigestSummary,
  buildNewListingsMessage,
  buildPriceChangesMessage,
  type DigestData,
} from '../../scheduler/digest'
import { messages } from '../messages'

const userDigestCache = new Map<number, DigestData>()

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
        userDigestCache.set(ctx.from.id, data)
        await ctx.reply(summary.text, {
          parse_mode: 'HTML',
          reply_markup: summary.keyboard,
        })
      } else {
        await ctx.reply(messages.digestEmpty)
      }
    } catch (error) {
      console.error('Digest command failed:', error)
      await ctx.reply(messages.digestFailed)
    }
  })

  bot.action('digest_new', async (ctx) => {
    const data = userDigestCache.get(ctx.from.id)
    if (!data || data.newListings.length === 0) {
      await ctx.answerCbQuery(messages.digestEmpty)
      return
    }

    const text = buildNewListingsMessage(data.newListings)
    await ctx.reply(text, { parse_mode: 'HTML' })
    await ctx.answerCbQuery()
  })

  bot.action('digest_prices', async (ctx) => {
    const data = userDigestCache.get(ctx.from.id)
    if (!data || data.priceChanges.length === 0) {
      await ctx.answerCbQuery(messages.digestEmpty)
      return
    }

    const text = buildPriceChangesMessage(data.priceChanges)
    await ctx.reply(text, { parse_mode: 'HTML' })
    await ctx.answerCbQuery()
  })
}
