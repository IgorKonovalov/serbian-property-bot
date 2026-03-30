import { Telegraf } from 'telegraf'
import { initDatabase } from '../../db/database'
import { findOrCreateUser } from '../../db/queries/users'
import {
  createProfile,
  getUserProfiles,
  getProfileById,
  seedDefaultProfiles,
} from '../../db/queries/search-profiles'
import { registerProfilesCommand } from './profiles'

function makeBot(): Telegraf {
  const bot = new Telegraf('fake-token')
  registerProfilesCommand(bot)
  bot.telegram.callApi = jest.fn().mockResolvedValue({
    message_id: 1,
    date: Date.now(),
    chat: { id: 123, type: 'private' },
  })
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
        { type: 'bot_command' as const, offset: 0, length: text.length },
      ],
    },
  }
}

function makeTextUpdate(text: string, messageId = 2) {
  return {
    update_id: 3,
    message: {
      message_id: messageId,
      from: {
        id: 123,
        is_bot: false,
        first_name: 'Test',
        username: 'testuser',
      },
      chat: { id: 123, type: 'private' as const },
      date: Math.floor(Date.now() / 1000),
      text,
    },
  }
}

function makeCallbackUpdate(data: string) {
  return {
    update_id: 2,
    callback_query: {
      id: 'cb1',
      from: {
        id: 123,
        is_bot: false,
        first_name: 'Test',
        username: 'testuser',
      },
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

let userId: number

beforeEach(() => {
  initDatabase(':memory:')
  userId = findOrCreateUser(123, 'testuser').id
})

describe('registerProfilesCommand', () => {
  it('shows empty message when no profiles', async () => {
    const bot = makeBot()
    await bot.handleUpdate(makeCommandUpdate('/profiles'))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'sendMessage',
      expect.objectContaining({
        chat_id: 123,
        text: expect.stringContaining('нет профилей'),
      })
    )
  })

  it('shows profiles list when profiles exist', async () => {
    const bot = makeBot()
    createProfile(userId, 'Test profile', 'kuća')

    await bot.handleUpdate(makeCommandUpdate('/profiles'))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'sendMessage',
      expect.objectContaining({
        text: expect.stringContaining('Ваши профили'),
      })
    )
  })

  it('views profile details via callback', async () => {
    const bot = makeBot()
    const profile = createProfile(userId, 'Test profile', 'kuća')

    await bot.handleUpdate(makeCallbackUpdate(`prof_view_${profile.id}`))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'editMessageText',
      expect.objectContaining({
        text: expect.stringContaining('Test profile'),
      })
    )
  })

  it('returns not found for non-existent profile view', async () => {
    const bot = makeBot()
    await bot.handleUpdate(makeCallbackUpdate('prof_view_999'))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'answerCallbackQuery',
      expect.objectContaining({
        text: expect.stringContaining('не найден'),
      })
    )
  })

  it('deletes profile via confirm callback', async () => {
    const bot = makeBot()
    const profile = createProfile(userId, 'To delete', 'x')

    await bot.handleUpdate(makeCallbackUpdate(`prof_delok_${profile.id}`))

    expect(getProfileById(profile.id, userId)).toBeUndefined()
  })

  it('shows delete confirmation', async () => {
    const bot = makeBot()
    const profile = createProfile(userId, 'To delete', 'x')

    await bot.handleUpdate(makeCallbackUpdate(`prof_del_${profile.id}`))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'editMessageText',
      expect.objectContaining({
        text: expect.stringContaining('Удалить профиль'),
      })
    )
  })

  it('navigates back to profile list', async () => {
    const bot = makeBot()
    createProfile(userId, 'Test', 'kuća')

    await bot.handleUpdate(makeCallbackUpdate('prof_list'))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'editMessageText',
      expect.objectContaining({
        text: expect.stringContaining('Ваши профили'),
      })
    )
  })

  it('starts add profile flow', async () => {
    const bot = makeBot()

    await bot.handleUpdate(makeCallbackUpdate('prof_add'))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'editMessageText',
      expect.objectContaining({
        text: expect.stringContaining('название профиля'),
      })
    )
  })

  it('cancels profile wizard', async () => {
    const bot = makeBot()
    // Start adding
    await bot.handleUpdate(makeCallbackUpdate('prof_add'))
    ;(bot.telegram.callApi as jest.Mock).mockClear()
    await bot.handleUpdate(makeCallbackUpdate('prof_cancel'))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'editMessageText',
      expect.objectContaining({
        text: expect.stringContaining('Отменено'),
      })
    )
  })

  it('creates profile through full add flow', async () => {
    const bot = makeBot()

    // Step 1: Start add
    await bot.handleUpdate(makeCallbackUpdate('prof_add'))

    // Step 2: Enter name
    await bot.handleUpdate(makeTextUpdate('New profile'))

    // Step 3: Enter keywords
    await bot.handleUpdate(makeTextUpdate('Banatska kuća', 3))

    // Step 4: Enter filters (skip with -)
    await bot.handleUpdate(makeTextUpdate('-', 4))

    const profiles = getUserProfiles(userId)
    expect(profiles.find((p) => p.name === 'New profile')).toBeDefined()
  })

  it('creates profile with filters', async () => {
    const bot = makeBot()

    await bot.handleUpdate(makeCallbackUpdate('prof_add'))
    await bot.handleUpdate(makeTextUpdate('Filtered'))
    await bot.handleUpdate(makeTextUpdate('-', 3))
    await bot.handleUpdate(makeTextUpdate('50000-200000, 40-120, 10', 4))

    const profiles = getUserProfiles(userId)
    const created = profiles.find((p) => p.name === 'Filtered')
    expect(created).toBeDefined()
    expect(created!.min_price).toBe(50000)
    expect(created!.max_price).toBe(200000)
    expect(created!.min_size).toBe(40)
    expect(created!.max_size).toBe(120)
    expect(created!.min_plot_size).toBe(10)
  })

  it('uses name as keywords when - is sent', async () => {
    const bot = makeBot()

    await bot.handleUpdate(makeCallbackUpdate('prof_add'))
    await bot.handleUpdate(makeTextUpdate('Banatska kuća'))
    await bot.handleUpdate(makeTextUpdate('-', 3))
    await bot.handleUpdate(makeTextUpdate('-', 4))

    const profiles = getUserProfiles(userId)
    const created = profiles.find((p) => p.name === 'Banatska kuća')
    expect(created).toBeDefined()
    expect(created!.keywords).toBe('Banatska kuća')
  })

  it('edits profile name via flow', async () => {
    const bot = makeBot()
    const profile = createProfile(userId, 'Old name', 'kuća')

    await bot.handleUpdate(makeCallbackUpdate(`prof_editn_${profile.id}`))
    await bot.handleUpdate(makeTextUpdate('New name'))

    const updated = getProfileById(profile.id, userId)
    expect(updated!.name).toBe('New name')
  })

  it('edits profile keywords via flow', async () => {
    const bot = makeBot()
    const profile = createProfile(userId, 'Test', 'old keywords')

    await bot.handleUpdate(makeCallbackUpdate(`prof_editk_${profile.id}`))
    await bot.handleUpdate(makeTextUpdate('new keywords'))

    const updated = getProfileById(profile.id, userId)
    expect(updated!.keywords).toBe('new keywords')
  })

  it('edits profile filters via flow', async () => {
    const bot = makeBot()
    const profile = createProfile(userId, 'Test', 'kuća')

    await bot.handleUpdate(makeCallbackUpdate(`prof_editf_${profile.id}`))
    await bot.handleUpdate(makeTextUpdate('30000-150000, 50-100, 5'))

    const updated = getProfileById(profile.id, userId)
    expect(updated!.min_price).toBe(30000)
    expect(updated!.max_price).toBe(150000)
  })

  it('shows edit options menu', async () => {
    const bot = makeBot()
    const profile = createProfile(userId, 'Test', 'kuća')

    await bot.handleUpdate(makeCallbackUpdate(`prof_edit_${profile.id}`))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'editMessageText',
      expect.objectContaining({
        text: expect.stringContaining('изменить'),
      })
    )
  })

  it('runs search from profile', async () => {
    const bot = makeBot()
    seedDefaultProfiles(userId)
    const profiles = getUserProfiles(userId)

    await bot.handleUpdate(makeCallbackUpdate(`prof_run_${profiles[0].id}`))

    expect(bot.telegram.callApi).toHaveBeenCalledWith(
      'editMessageText',
      expect.objectContaining({
        text: expect.stringContaining('район'),
      })
    )
  })
})
