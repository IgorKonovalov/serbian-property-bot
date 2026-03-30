import { Telegraf } from 'telegraf'
import { registerHelpCommand } from './help'

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
  registerHelpCommand(bot)
  jest.spyOn(bot.telegram, 'callApi').mockResolvedValue(true as any)
  return bot
}

function makeCommandUpdate(text: string) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: 123, is_bot: false, first_name: 'Test' },
      chat: { id: 123, type: 'private' as const },
      date: Math.floor(Date.now() / 1000),
      text,
      entities: [
        { type: 'bot_command' as const, offset: 0, length: text.length },
      ],
    },
  }
}

function makeCallbackUpdate(data: string) {
  return {
    update_id: 2,
    callback_query: {
      id: 'cb1',
      from: { id: 123, is_bot: false, first_name: 'Test' },
      chat_instance: '123',
      message: {
        message_id: 10,
        from: { id: 999, is_bot: true, first_name: 'Bot' },
        chat: { id: 123, type: 'private' as const },
        date: Math.floor(Date.now() / 1000),
        text: 'old',
      },
      data,
    },
  }
}

describe('registerHelpCommand', () => {
  it('responds to /help command', async () => {
    const bot = makeBot()
    await bot.handleUpdate(makeCommandUpdate('/help'))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'sendMessage',
      expect.objectContaining({ chat_id: 123, parse_mode: 'HTML' }),
      undefined
    )
  })

  it('responds to help_show callback', async () => {
    const bot = makeBot()
    await bot.handleUpdate(makeCallbackUpdate('help_show'))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'sendMessage',
      expect.objectContaining({ chat_id: 123 }),
      undefined
    )
  })

  it('responds to help_back callback with editMessageText', async () => {
    const bot = makeBot()
    await bot.handleUpdate(makeCallbackUpdate('help_back'))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'editMessageText',
      expect.objectContaining({ chat_id: 123, message_id: 10 }),
      undefined
    )
  })

  it.each(['help_search', 'help_profiles', 'help_favorites', 'help_digest'])(
    'responds to %s callback',
    async (action) => {
      const bot = makeBot()
      await bot.handleUpdate(makeCallbackUpdate(action))

      expect(bot.telegram.callApi).toHaveBeenCalledWith(
        'editMessageText',
        expect.objectContaining({ chat_id: 123 }),
        undefined
      )
    }
  )
})
