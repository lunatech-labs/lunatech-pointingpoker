import { describe, expect, it } from 'vitest'
import type { Estimation, RoomSnapshot } from '../protocol/snapshot'
import { applySnapshot } from './view'

const none: Estimation = { type: 'NoEstimation' }
const confirmed = (value: string): Estimation => ({ type: 'Confirmed', value })
const unconfirmed = (value: string): Estimation => ({ type: 'Unconfirmed', value })

const row = (id: string, estimation: Estimation) => ({ id, name: id.toUpperCase(), estimation })
const snap = (users: RoomSnapshot['users'], extra: Partial<RoomSnapshot> = {}): RoomSnapshot => ({
  you: 'a',
  currentIssue: 'PP-1',
  votesRevealed: false,
  users,
  ...extra
})
const idle = { issueFocused: false, currentIssue: '' }

describe('applySnapshot', () => {
  it('reads each estimation tag into the row the table renders', () => {
    const s = snap([
      row('a', none),
      row('b', { type: 'ConfirmedHidden' }),
      row('c', { type: 'UnconfirmedHidden' }),
      row('d', confirmed('5')),
      row('e', unconfirmed('8'))
    ])
    expect(applySnapshot(idle, s).users.map(u => [u.voted, u.hasEstimation, u.estimation])).toEqual([
      [false, false, ''],
      [true, true, ''],
      [false, true, ''],
      [true, true, '5'],
      [false, true, '8']
    ])
  })

  it('tallies every participant with an estimation, confirmed or not, most votes first', () => {
    const s = snap(
      [row('a', confirmed('5')), row('b', unconfirmed('8')), row('c', confirmed('8')), row('d', none)],
      { votesRevealed: true }
    )
    expect(applySnapshot(idle, s).votesSummary).toEqual([
      ['8', 2],
      ['5', 1]
    ])
  })

  it("keeps the typed issue while the input is focused, and takes the room's otherwise", () => {
    const s = snap([row('a', none)])
    expect(applySnapshot({ issueFocused: true, currentIssue: 'draft' }, s).currentIssue).toBe('draft')
    expect(applySnapshot({ issueFocused: false, currentIssue: 'draft' }, s).currentIssue).toBe('PP-1')
  })

  it("reads the reader's own estimation and whether it is confirmed", () => {
    const own = (e: Estimation) => applySnapshot(idle, snap([row('a', e)]))
    expect(own(confirmed('5'))).toMatchObject({ userEstimation: '5', ownVoteConfirmed: true })
    expect(own(unconfirmed('5'))).toMatchObject({ userEstimation: '5', ownVoteConfirmed: false })
    expect(own(none)).toMatchObject({ userEstimation: '', ownVoteConfirmed: true })
    const absent = applySnapshot(idle, snap([row('b', confirmed('5'))]))
    expect(absent).toMatchObject({ userEstimation: '', ownVoteConfirmed: true })
  })
})
