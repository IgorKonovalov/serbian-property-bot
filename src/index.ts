import { config } from './config'
import { initDatabase } from './db/database'
import { createBot } from './bot/bot'
import { ParserRegistry } from './parsers/registry'
import { HalooglasiParser } from './parsers/halooglasi'
import { NekretnineParser } from './parsers/nekretnine'

const db = initDatabase(config.dbPath)
console.log(`Database initialized at ${config.dbPath}`)

const registry = new ParserRegistry()
registry.register(new HalooglasiParser())
registry.register(new NekretnineParser())
console.log(
  `Parser registry ready (${registry.registeredSources.length} sources: ${registry.registeredSources.join(', ')})`
)

const bot = createBot(registry)

bot.launch(() => {
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
