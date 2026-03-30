import { Telegraf } from 'telegraf'
import { findOrCreateUser } from '../../db/queries/users'
import { seedDefaultProfiles } from '../../db/queries/search-profiles'

export function registerStartCommand(bot: Telegraf): void {
  bot.start(async (ctx) => {
    const telegramId = ctx.from.id
    const username = ctx.from.username

    const user = findOrCreateUser(telegramId, username)
    seedDefaultProfiles(user.id)

    await ctx.reply(
      `Welcome to Property Bot! 🏠\n\n` +
        `I help you search Serbian property listing sites.\n\n` +
        `Available commands:\n` +
        `/search — Search for properties\n` +
        `/profiles — Manage your search profiles\n` +
        `/favorites — View saved listings\n` +
        `/digest — Get today's price changes & new listings`
    )
  })
}
