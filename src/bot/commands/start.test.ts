import { Telegraf } from 'telegraf'
import { initDatabase } from '../../db/database'
import { getUserByTelegramId } from '../../db/queries/users'
import { getUserProfiles } from '../../db/queries/search-profiles'
import { registerStartCommand } from './start'

const BOT_INFO = {
  id: 999,
  is_bot: true as const,
  first_name: 'TestBot',
  username: 'test_bot',
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
}

function makeBot(): Telegraf {
  const bot = new Telegraf('fake-token')
  bot.botInfo = BOT_INFO
  registerStartCommand(bot)
  // Mock all Telegram API methods used by handlers
  bot.telegram.sendMessage = jest.fn().mockResolvedValue({ message_id: 1 })
  bot.telegram.editMessageText = jest.fn().mockResolvedValue(true)
  bot.telegram.answerCbQuery = jest.fn().mockResolvedValue(true)
  return bot
}

function makeCommandUpdate(text: string) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      from: {
        id: 123,
        is_bot: false,
        first_name: 'Test',
        username: 'testuser',
      },
      chat: { id: 123, type: 'private' as const },
      date: Math.floor(Date.now() / 1000),
      text,
      entities: [
        {
          type: 'bot_command' as const,
          offset: 0,
          length: text.split(' ')[0].length,
        },
      ],
    },
  }
}

beforeEach(() => {
  initDatabase(':memory:')
})

describe('registerStartCommand', () => {
  it('creates user in database on /start', async () => {
    const bot = makeBot()
    await bot.handleUpdate(makeCommandUpdate('/start'))

    const user = getUserByTelegramId(123)
    expect(user).toBeDefined()
    expect(user!.telegram_id).toBe(123)
    expect(user!.username).toBe('testuser')
  })

  it('seeds default profiles for new user', async () => {
    const bot = makeBot()
    await bot.handleUpdate(makeCommandUpdate('/start'))

    const user = getUserByTelegramId(123)!
    const profiles = getUserProfiles(user.id)
    expect(profiles).toHaveLength(5)
  })

  it('sends welcome message with HTML parse mode', async () => {
    const bot = makeBot()
    await bot.handleUpdate(makeCommandUpdate('/start'))

    expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('Property Bot'),
      expect.objectContaining({ parse_mode: 'HTML' })
    )
  })
})
