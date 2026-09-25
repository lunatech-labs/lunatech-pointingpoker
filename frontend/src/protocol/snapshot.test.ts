import { describe, expect, it } from 'vitest'
import { snapshotSchema, strictSnapshotSchema } from './snapshot'

const base = {
  you: 'a',
  currentIssue: '',
  votesRevealed: false,
  users: [{ id: 'a', name: 'A', voted: false, hasEstimation: false, estimation: '' }]
}

describe('the snapshot schemas', () => {
  it('drop an unknown key when lenient and refuse it at any depth when strict', () => {
    const top = { ...base, extra: 1 }
    const nested = { ...base, users: [{ ...base.users[0], extra: 1 }] }
    expect(snapshotSchema.parse(top)).toEqual(base)
    expect(snapshotSchema.parse(nested)).toEqual(base)
    expect(strictSnapshotSchema.safeParse(top).success).toBe(false)
    expect(strictSnapshotSchema.safeParse(nested).success).toBe(false)
    expect(strictSnapshotSchema.safeParse(base).success).toBe(true)
  })
})
