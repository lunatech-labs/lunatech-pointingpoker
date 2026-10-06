import { describe, expect, it } from 'vitest'
import {
  chooseDefault,
  forgetRole,
  joinRole,
  keepDefault,
  rememberRole,
  storedDefault,
  type RoleStorage
} from './joinRole'

// localStorage's semantics over a Map, seeded as a browser could have left it.
const storage = (seed: Record<string, string> = {}) => {
  const items = new Map(Object.entries(seed))
  const fake: RoleStorage = {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: key => void items.delete(key)
  }
  return { fake, items: () => Object.fromEntries(items) }
}

const room = 'brave-golden-otter'
const other = 'calm-silver-heron'

describe('a stored value other than the two roles', () => {
  it.each(['', 'voter', 'Observer', 'null'])('reads as no default role: %j', value => {
    expect(storedDefault(storage({ defaultRole: value }).fake)).toBeNull()
  })

  it.each(['', 'facilitator', 'Observer', 'null'])('is skipped as a remembered role: %j', value => {
    const { fake } = storage({ [`role:${room}`]: value })
    expect(joinRole(fake, room, 'Voter')).toBe('Voter')
  })

  it('is replaced by a submit, which keeps what the lobby showed', () => {
    const { fake, items } = storage({ defaultRole: 'Observer' })
    expect(keepDefault(fake, 'Voter')).toBe('Voter')
    expect(items()).toEqual({ defaultRole: 'Voter' })
  })
})

describe('the join role', () => {
  it('takes the remembered role, else the default', () => {
    const { fake } = storage({ [`role:${room}`]: 'Facilitator' })
    expect(joinRole(fake, room, 'Voter')).toBe('Facilitator')
    expect(joinRole(fake, other, 'Voter')).toBe('Voter')
  })

  it('takes the remembered role over a default a first visit just set', () => {
    const { fake } = storage({ [`role:${room}`]: 'Facilitator' })
    expect(joinRole(fake, room, keepDefault(fake, 'Voter'))).toBe('Facilitator')
  })

  it('takes the default once Create forgets the room', () => {
    const { fake } = storage({ [`role:${room}`]: 'Voter', defaultRole: 'Facilitator' })
    forgetRole(fake, room)
    expect(joinRole(fake, room, keepDefault(fake, 'Voter'))).toBe('Facilitator')
  })
})

describe('the default role', () => {
  it('is stored by a submit only when none is', () => {
    const { fake, items } = storage({ defaultRole: 'Facilitator' })
    expect(keepDefault(fake, 'Voter')).toBe('Facilitator')
    expect(items()).toEqual({ defaultRole: 'Facilitator' })
  })

  it('is overwritten by each choice', () => {
    const { fake } = storage()
    chooseDefault(fake, 'Facilitator')
    chooseDefault(fake, 'Voter')
    expect(storedDefault(fake)).toBe('Voter')
  })

  it("is not written by a room's role, which writes only its own room's key", () => {
    const { fake, items } = storage({ defaultRole: 'Voter', [`role:${other}`]: 'Voter' })
    rememberRole(fake, room, 'Facilitator')
    expect(items()).toEqual({
      defaultRole: 'Voter',
      [`role:${other}`]: 'Voter',
      [`role:${room}`]: 'Facilitator'
    })
  })
})
