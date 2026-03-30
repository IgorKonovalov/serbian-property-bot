import { Telegraf } from 'telegraf'
import { findOrCreateUser } from '../../db/queries/users'
import type { ParserRegistry } from '../../parsers/registry'
import { buildDigestForUser } from '../../scheduler/digest'
import { messages } from '../messages'

export function registerDigestCommand(
  bot: Telegraf,
  registry: ParserRegistry
): void {
  bot.command('digest', async (ctx) => {
    const user = findOrCreateUser(ctx.from.id, ctx.from.username)

    await ctx.reply(messages.digestLoading)

    try {
      const digest = await buildDigestForUser(user.id, registry)

      if (digest) {
        await ctx.reply(digest, { parse_mode: 'Markdown' })
      } else {
        await ctx.reply(messages.digestEmpty)
      }
    } catch (error) {
      console.error('Digest command failed:', error)
      await ctx.reply(messages.searchFailed)
    }
  })
}
