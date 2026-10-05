import { describe, expect, it } from 'vitest'
import { snapshotSchema, strictSnapshotSchema } from './snapshot'

const withSeat = (seat: object) => ({
  you: 'a',
  currentIssue: '',
  votesRevealed: false,
  users: [{ id: 'a', name: 'A', seat }]
})
const withEstimation = (estimation: object) => withSeat({ type: 'Voter', estimation })
const base = withEstimation({ type: 'NoEstimation' })

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

  it('accept each estimation tag with a value exactly where the reader may see one', () => {
    for (const type of ['NoEstimation', 'ConfirmedHidden', 'UnconfirmedHidden'])
      expect(strictSnapshotSchema.safeParse(withEstimation({ type })).success).toBe(true)
    for (const type of ['Confirmed', 'Unconfirmed'])
      expect(strictSnapshotSchema.safeParse(withEstimation({ type, value: '5' })).success).toBe(true)
    expect(snapshotSchema.safeParse(withEstimation({ type: 'Confirmed' })).success).toBe(false)
    expect(snapshotSchema.safeParse(withEstimation({ type: 'Bogus' })).success).toBe(false)
    const leaked = withEstimation({ type: 'ConfirmedHidden', value: '5' })
    expect(strictSnapshotSchema.safeParse(leaked).success).toBe(false)
  })

  it('accept a facilitator seat only with no estimation, and a voter seat only with one', () => {
    expect(strictSnapshotSchema.safeParse(withSeat({ type: 'Facilitator' })).success).toBe(true)
    const holding = withSeat({ type: 'Facilitator', estimation: { type: 'NoEstimation' } })
    expect(strictSnapshotSchema.safeParse(holding).success).toBe(false)
    expect(snapshotSchema.safeParse(withSeat({ type: 'Voter' })).success).toBe(false)
    expect(snapshotSchema.safeParse(withSeat({ type: 'Observer' })).success).toBe(false)
  })
})
