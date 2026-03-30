import { config } from './config'
import { initDatabase } from './db/database'
import { createBot } from './bot/bot'
import { ParserRegistry } from './parsers/registry'

const db = initDatabase(config.dbPath)
console.log(`Database initialized at ${config.dbPath}`)

const registry = new ParserRegistry()
// Parsers will be registered here in Phase 2
console.log(
  `Parser registry ready (${registry.registeredSources.length} sources)`
)

const bot = createBot()

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
