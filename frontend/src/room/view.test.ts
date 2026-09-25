import { describe, expect, it } from 'vitest'
import type { Participant, RoomSnapshot } from '../protocol/snapshot'
import { applySnapshot } from './view'

const row = (id: string, voted: boolean, estimation: string): Participant => ({
  id,
  name: id.toUpperCase(),
  voted,
  hasEstimation: estimation !== '' || voted,
  estimation
})
const snap = (users: Participant[], extra: Partial<RoomSnapshot> = {}): RoomSnapshot => ({
  you: 'a',
  currentIssue: 'PP-1',
  votesRevealed: false,
  users,
  ...extra
})
const idle = { issueFocused: false, currentIssue: '' }

describe('applySnapshot', () => {
  it('tallies every participant with an estimation, confirmed or not, most votes first', () => {
    const s = snap(
      [row('a', true, '5'), row('b', false, '8'), row('c', true, '8'), row('d', false, '')],
      { votesRevealed: true }
    )
    expect(applySnapshot(idle, s).votesSummary).toEqual([
      ['8', 2],
      ['5', 1]
    ])
  })

  it("keeps the typed issue while the input is focused, and takes the room's otherwise", () => {
    const s = snap([row('a', false, '')])
    expect(applySnapshot({ issueFocused: true, currentIssue: 'draft' }, s).currentIssue).toBe('draft')
    expect(applySnapshot({ issueFocused: false, currentIssue: 'draft' }, s).currentIssue).toBe('PP-1')
  })

  it("reads the reader's own estimation and whether it is confirmed", () => {
    const own = (voted: boolean, estimation: string) =>
      applySnapshot(idle, snap([row('a', voted, estimation)]))
    expect(own(true, '5')).toMatchObject({ userEstimation: '5', ownVoteConfirmed: true })
    expect(own(false, '5')).toMatchObject({ userEstimation: '5', ownVoteConfirmed: false })
    expect(own(false, '')).toMatchObject({ userEstimation: '', ownVoteConfirmed: true })
    const absent = applySnapshot(idle, snap([row('b', true, '5')]))
    expect(absent).toMatchObject({ userEstimation: '', ownVoteConfirmed: true })
  })
})
