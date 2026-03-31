import { initDatabase } from '../database'
import {
  createProfile,
  getUserProfiles,
  getProfileById,
  updateProfile,
  deleteProfile,
  seedDefaultProfiles,
} from './search-profiles'
import { findOrCreateUser } from './users'

let userId: number

beforeEach(() => {
  initDatabase(':memory:')
  userId = findOrCreateUser(1, 'testuser').id
})

describe('createProfile', () => {
  it('creates a profile with required fields', () => {
    const profile = createProfile(userId, 'Test', 'kuća')
    expect(profile.id).toBeGreaterThan(0)
    expect(profile.name).toBe('Test')
    expect(profile.keywords).toBe('kuća')
    expect(profile.user_id).toBe(userId)
    expect(profile.is_active).toBe(1)
  })

  it('creates a profile with filters', () => {
    const profile = createProfile(userId, 'Filtered', 'stan', {
      minPrice: 50000,
      maxPrice: 200000,
      minSize: 40,
      maxSize: 120,
      minPlotSize: 10,
    })
    expect(profile.min_price).toBe(50000)
    expect(profile.max_price).toBe(200000)
    expect(profile.min_size).toBe(40)
    expect(profile.max_size).toBe(120)
    expect(profile.min_plot_size).toBe(10)
  })

  it('sets null for omitted filters', () => {
    const profile = createProfile(userId, 'No filters', 'kuća')
    expect(profile.min_price).toBeNull()
    expect(profile.max_price).toBeNull()
    expect(profile.min_size).toBeNull()
    expect(profile.max_size).toBeNull()
    expect(profile.min_plot_size).toBeNull()
  })
})

describe('getUserProfiles', () => {
  it('returns empty array when user has no profiles', () => {
    expect(getUserProfiles(userId)).toEqual([])
  })

  it('returns profiles ordered by name', () => {
    createProfile(userId, 'Zebra', 'z')
    createProfile(userId, 'Alpha', 'a')
    createProfile(userId, 'Middle', 'm')
    const profiles = getUserProfiles(userId)
    expect(profiles.map((p) => p.name)).toEqual(['Alpha', 'Middle', 'Zebra'])
  })

  it('does not return profiles of other users', () => {
    const otherUser = findOrCreateUser(2, 'other').id
    createProfile(userId, 'Mine', 'x')
    createProfile(otherUser, 'Theirs', 'y')
    expect(getUserProfiles(userId)).toHaveLength(1)
    expect(getUserProfiles(otherUser)).toHaveLength(1)
  })
})

describe('getProfileById', () => {
  it('returns profile when id and userId match', () => {
    const created = createProfile(userId, 'Test', 'kuća')
    const found = getProfileById(created.id, userId)
    expect(found).toBeDefined()
    expect(found!.name).toBe('Test')
  })

  it('returns undefined when userId does not match', () => {
    const otherUser = findOrCreateUser(2).id
    const created = createProfile(userId, 'Test', 'kuća')
    expect(getProfileById(created.id, otherUser)).toBeUndefined()
  })

  it('returns undefined for non-existent id', () => {
    expect(getProfileById(999, userId)).toBeUndefined()
  })
})

describe('updateProfile', () => {
  it('updates name', () => {
    const profile = createProfile(userId, 'Old', 'kuća')
    const result = updateProfile(profile.id, userId, { name: 'New' })
    expect(result).toBe(true)
    expect(getProfileById(profile.id, userId)!.name).toBe('New')
  })

  it('updates multiple fields at once', () => {
    const profile = createProfile(userId, 'Test', 'kuća')
    updateProfile(profile.id, userId, {
      keywords: 'stan',
      minPrice: 30000,
      maxPrice: 100000,
    })
    const updated = getProfileById(profile.id, userId)!
    expect(updated.keywords).toBe('stan')
    expect(updated.min_price).toBe(30000)
    expect(updated.max_price).toBe(100000)
  })

  it('returns false when no fields provided', () => {
    const profile = createProfile(userId, 'Test', 'kuća')
    expect(updateProfile(profile.id, userId, {})).toBe(false)
  })

  it('returns false when updating non-existent profile', () => {
    expect(updateProfile(999, userId, { name: 'X' })).toBe(false)
  })

  it('returns false when userId does not match', () => {
    const otherUser = findOrCreateUser(2).id
    const profile = createProfile(userId, 'Test', 'kuća')
    expect(updateProfile(profile.id, otherUser, { name: 'X' })).toBe(false)
  })

  it('can set filter to null', () => {
    const profile = createProfile(userId, 'Test', 'kuća', { minPrice: 5000 })
    updateProfile(profile.id, userId, { minPrice: null })
    expect(getProfileById(profile.id, userId)!.min_price).toBeNull()
  })

  it('updates minSize', () => {
    const profile = createProfile(userId, 'Test', 'kuća')
    updateProfile(profile.id, userId, { minSize: 50 })
    expect(getProfileById(profile.id, userId)!.min_size).toBe(50)
  })

  it('updates maxSize', () => {
    const profile = createProfile(userId, 'Test', 'kuća')
    updateProfile(profile.id, userId, { maxSize: 200 })
    expect(getProfileById(profile.id, userId)!.max_size).toBe(200)
  })

  it('updates minPlotSize', () => {
    const profile = createProfile(userId, 'Test', 'kuća')
    updateProfile(profile.id, userId, { minPlotSize: 15 })
    expect(getProfileById(profile.id, userId)!.min_plot_size).toBe(15)
  })

  it('updates isActive', () => {
    const profile = createProfile(userId, 'Test', 'kuća')
    updateProfile(profile.id, userId, { isActive: 0 })
    expect(getProfileById(profile.id, userId)!.is_active).toBe(0)
  })
})

describe('deleteProfile', () => {
  it('deletes existing profile', () => {
    const profile = createProfile(userId, 'Test', 'kuća')
    expect(deleteProfile(profile.id, userId)).toBe(true)
    expect(getProfileById(profile.id, userId)).toBeUndefined()
  })

  it('returns false for non-existent profile', () => {
    expect(deleteProfile(999, userId)).toBe(false)
  })

  it('returns false when userId does not match', () => {
    const otherUser = findOrCreateUser(2).id
    const profile = createProfile(userId, 'Test', 'kuća')
    expect(deleteProfile(profile.id, otherUser)).toBe(false)
  })
})

describe('seedDefaultProfiles', () => {
  it('seeds 5 default profiles for a new user', () => {
    seedDefaultProfiles(userId)
    const profiles = getUserProfiles(userId)
    expect(profiles).toHaveLength(5)
  })

  it('does not seed if user already has profiles', () => {
    createProfile(userId, 'Existing', 'x')
    seedDefaultProfiles(userId)
    const profiles = getUserProfiles(userId)
    expect(profiles).toHaveLength(1)
    expect(profiles[0].name).toBe('Existing')
  })

  it('seeds profiles with correct filter on Porodična kuća', () => {
    seedDefaultProfiles(userId)
    const profiles = getUserProfiles(userId)
    const porodicna = profiles.find((p) => p.name.includes('Porodična'))
    expect(porodicna).toBeDefined()
    expect(porodicna!.min_plot_size).toBe(17)
  })
})
