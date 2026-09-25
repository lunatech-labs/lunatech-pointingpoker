import { describe, expect, it } from 'vitest'
import { snapshotSchema, strictSnapshotSchema } from './snapshot'

const withEstimation = (estimation: object) => ({
  you: 'a',
  currentIssue: '',
  votesRevealed: false,
  users: [{ id: 'a', name: 'A', estimation }]
})
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
})
