import { initDatabase } from '../database'
import { findOrCreateUser, getUserByTelegramId, getAllUsers } from './users'

beforeEach(() => {
  initDatabase(':memory:')
})

describe('findOrCreateUser', () => {
  it('creates a new user with telegram id and username', () => {
    const user = findOrCreateUser(123, 'alice')
    expect(user.telegram_id).toBe(123)
    expect(user.username).toBe('alice')
    expect(user.id).toBeGreaterThan(0)
  })

  it('creates a user without username', () => {
    const user = findOrCreateUser(456)
    expect(user.telegram_id).toBe(456)
    expect(user.username).toBeNull()
  })

  it('returns existing user on duplicate telegram id', () => {
    const first = findOrCreateUser(123, 'alice')
    const second = findOrCreateUser(123, 'alice_new')
    expect(second.id).toBe(first.id)
    expect(second.username).toBe('alice') // original username preserved
  })
})

describe('getUserByTelegramId', () => {
  it('returns user when found', () => {
    findOrCreateUser(100, 'bob')
    const user = getUserByTelegramId(100)
    expect(user).toBeDefined()
    expect(user!.telegram_id).toBe(100)
    expect(user!.username).toBe('bob')
  })

  it('returns undefined when not found', () => {
    expect(getUserByTelegramId(999)).toBeUndefined()
  })
})

describe('getAllUsers', () => {
  it('returns empty array when no users', () => {
    expect(getAllUsers()).toEqual([])
  })

  it('returns all created users', () => {
    findOrCreateUser(1, 'a')
    findOrCreateUser(2, 'b')
    findOrCreateUser(3, 'c')
    const users = getAllUsers()
    expect(users).toHaveLength(3)
    expect(users.map((u) => u.telegram_id)).toEqual(
      expect.arrayContaining([1, 2, 3])
    )
  })
})
