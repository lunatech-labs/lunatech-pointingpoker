import { describe, expect, it } from 'vitest'
import type { Estimation, Participant, RoomSnapshot } from '../protocol/snapshot'
import { applySnapshot } from './view'

const none: Estimation = { type: 'NoEstimation' }
const confirmed = (value: string): Estimation => ({ type: 'Confirmed', value })
const unconfirmed = (value: string): Estimation => ({ type: 'Unconfirmed', value })

const row = (id: string, estimation: Estimation): Participant => ({
  id,
  name: id.toUpperCase(),
  seat: { type: 'Voter', estimation }
})
const facilitator = (id: string): Participant => ({
  id,
  name: id.toUpperCase(),
  seat: { type: 'Facilitator' }
})
const snap = (users: RoomSnapshot['users'], extra: Partial<RoomSnapshot> = {}): RoomSnapshot => ({
  you: 'a',
  currentIssue: 'PP-1',
  votesRevealed: false,
  users,
  ...extra
})
describe('applySnapshot', () => {
  it('reads each estimation tag into the row the table renders', () => {
    const s = snap([
      row('a', none),
      row('b', { type: 'ConfirmedHidden' }),
      row('c', { type: 'UnconfirmedHidden' }),
      row('d', confirmed('5')),
      row('e', unconfirmed('8'))
    ])
    expect(applySnapshot(s).users.map(u => [u.voted, u.hasEstimation, u.estimation])).toEqual([
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
    expect(applySnapshot(s).votesSummary).toEqual([
      ['8', 2],
      ['5', 1]
    ])
  })

  it("reads the reader's own estimation and whether it is confirmed", () => {
    const own = (e: Estimation) => applySnapshot(snap([row('a', e)]))
    expect(own(confirmed('5'))).toMatchObject({ userEstimation: '5', ownVoteConfirmed: true })
    expect(own(unconfirmed('5'))).toMatchObject({ userEstimation: '5', ownVoteConfirmed: false })
    expect(own(none)).toMatchObject({ userEstimation: '', ownVoteConfirmed: true })
    const absent = applySnapshot(snap([row('b', confirmed('5'))]))
    expect(absent).toMatchObject({ userEstimation: '', ownVoteConfirmed: true })
  })

  it("gives a facilitator's row no estimation, so the tally leaves them out", () => {
    const s = snap([facilitator('a'), row('b', confirmed('5'))], { votesRevealed: true })
    const view = applySnapshot(s)
    expect(view.users.map(u => [u.voted, u.hasEstimation, u.estimation])).toEqual([
      [false, false, ''],
      [true, true, '5']
    ])
    expect(view.votesSummary).toEqual([['5', 1]])
    expect(view).toMatchObject({ userEstimation: '', ownVoteConfirmed: true })
  })

  it("marks a facilitator's row, and only theirs", () => {
    const s = snap([facilitator('a'), row('b', confirmed('5')), row('c', none)])
    expect(applySnapshot(s).users.map(u => u.facilitator)).toEqual([true, false, false])
  })

  it("reads the reader's own role from their seat", () => {
    expect(applySnapshot(snap([facilitator('a'), row('b', none)])).ownRole).toBe('Facilitator')
    expect(applySnapshot(snap([row('a', none), facilitator('b')])).ownRole).toBe('Voter')
    expect(applySnapshot(snap([facilitator('b')])).ownRole).toBeNull()
  })

  // Each pair is fed in the wrong order, so a missing sort fails every case.
  describe('lists participants in name order', () => {
    const named = (id: string, name: string): Participant => ({
      id,
      name,
      seat: { type: 'Voter', estimation: none }
    })
    const order = (...users: RoomSnapshot['users']) =>
      applySnapshot(snap(users)).users.map(u => u.name)

    it('puts a lowercase name among its letter, not after every capital', () => {
      expect(order(named('a', 'Bob'), named('b', 'alice'))).toEqual(['alice', 'Bob'])
    })

    it('puts a lowercase name before the same name capitalised', () => {
      expect(order(named('a', 'Alice'), named('b', 'alice'))).toEqual(['alice', 'Alice'])
    })

    it('puts an accented name among its base letter', () => {
      expect(order(named('a', 'Bob'), named('b', 'Ålice'))).toEqual(['Ålice', 'Bob'])
    })

    it('breaks a tie on name by user id', () => {
      const s = snap([named('b', 'Sam'), named('a', 'Sam')])
      expect(applySnapshot(s).users.map(u => u.id)).toEqual(['a', 'b'])
    })

    it('ignores leading spaces, and shows the name as typed', () => {
      expect(order(named('a', '  Zed'), named('b', 'Bob'))).toEqual(['Bob', '  Zed'])
    })

    it('puts Dev 2 before Dev 10', () => {
      expect(order(named('a', 'Dev 10'), named('b', 'Dev 2'))).toEqual(['Dev 2', 'Dev 10'])
    })

    it('puts a blank name first', () => {
      expect(order(named('a', 'Bob'), named('b', '   '))).toEqual(['   ', 'Bob'])
    })
  })
})
