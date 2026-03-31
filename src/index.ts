import { config } from './config'
import { initDatabase } from './db/database'
import { createBot } from './bot/bot'
import { ParserRegistry } from './parsers/registry'
import { HalooglasiParser } from './parsers/halooglasi'
import { NekretnineParser } from './parsers/nekretnine'
import { KupujemProdajemParser } from './parsers/kupujemprodajem'
import { startScheduler } from './scheduler/cron'

const db = initDatabase(config.dbPath)
console.log(`Database initialized at ${config.dbPath}`)

const registry = new ParserRegistry()
registry.register(new HalooglasiParser())
registry.register(new NekretnineParser())
registry.register(new KupujemProdajemParser())
console.log(
  `Parser registry ready (${registry.registeredSources.length} sources: ${registry.registeredSources.join(', ')})`
)

const bot = createBot(registry)

startScheduler(bot, registry)

bot.launch(async () => {
  await bot.telegram.setMyCommands([
    { command: 'start', description: 'Главное меню' },
    { command: 'search', description: 'Поиск недвижимости' },
    { command: 'profiles', description: 'Профили поиска' },
    { command: 'favorites', description: 'Избранное' },
    { command: 'digest', description: 'Дайджест — новые и цены' },
    { command: 'settings', description: 'Настройки' },
    { command: 'help', description: 'Помощь' },
  ])
  console.log('Property bot is running')
})

process.once('SIGINT', () => {
  bot.stop('SIGINT')
  db.close()
})
process.once('SIGTERM', () => {
  bot.stop('SIGTERM')
  db.close()
})
