import { describe, expect, it } from 'vitest'
import { progress } from './progress'
import type { ParticipantRow, VoteState } from './view'

const row = (name: string, state: VoteState): ParticipantRow => ({
  id: name,
  name,
  facilitator: false,
  self: false,
  voted: state === 'confirmed',
  hasEstimation: state !== 'none',
  estimation: ''
})

describe('progress', () => {
  it('counts a first round and lists who has no vote', () =>
    expect(progress([row('Ann', 'confirmed'), row('Bob', 'none'), row('Cid', 'none')])).toEqual({
      voted: 1,
      total: 3,
      bar: ['confirmed', 'none', 'none'],
      lines: [{ label: 'No vote', names: ['Bob', 'Cid'] }]
    }))
  it('lists kept cards as not confirmed, not as voted', () =>
    expect(progress([row('Ann', 'kept'), row('Bob', 'confirmed')])).toEqual({
      voted: 1,
      total: 2,
      bar: ['confirmed', 'kept'],
      lines: [{ label: 'Not confirmed', names: ['Ann'] }]
    }))
  it('groups the bar and keeps table order within each line', () =>
    expect(
      progress([row('Ann', 'none'), row('Bob', 'kept'), row('Cid', 'confirmed'), row('Dan', 'none')])
    ).toMatchObject({
      bar: ['confirmed', 'kept', 'none', 'none'],
      lines: [
        { label: 'No vote', names: ['Ann', 'Dan'] },
        { label: 'Not confirmed', names: ['Bob'] }
      ]
    }))
  it('has no lines when all voted', () => {
    const p = progress([row('Ann', 'confirmed'), row('Bob', 'confirmed')])
    expect(p?.lines).toEqual([])
    expect(p?.voted).toBe(p?.total)
  })
  it('is null without voters', () => expect(progress([])).toBeNull())
})
