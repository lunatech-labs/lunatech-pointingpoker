import type { Estimation, Participant, RoomSnapshot, Seat } from '../protocol/snapshot'

// What the table renders per participant, read off the union in one place.
export type ParticipantRow = {
  id: string
  name: string
  voted: boolean
  hasEstimation: boolean
  estimation: string
}

const confirmed = (e: Estimation) => e.type === 'Confirmed' || e.type === 'ConfirmedHidden'
const shown = (e: Estimation) =>
  e.type === 'Confirmed' || e.type === 'Unconfirmed' ? e.value : ''

// A facilitator's row has no estimation, so the tally leaves them out without a rule of its own.
const estimationOf = (seat: Seat): Estimation =>
  seat.type === 'Voter' ? seat.estimation : { type: 'NoEstimation' }

const toRow = ({ id, name, seat }: Participant): ParticipantRow => {
  const estimation = estimationOf(seat)
  return {
    id,
    name,
    voted: confirmed(estimation),
    hasEstimation: estimation.type !== 'NoEstimation',
    estimation: shown(estimation)
  }
}

// Pinned to one locale so every browser lists the room in the same order.
const collator = new Intl.Collator('en', { numeric: true })
const byName = (a: ParticipantRow, b: ParticipantRow) =>
  collator.compare(a.name.trim(), b.name.trim()) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export type View = {
  users: ParticipantRow[]
  votesRevealed: boolean
  currentIssue: string
  userEstimation: string
  ownVoteConfirmed: boolean
  votesSummary: [string, number][]
}

export function applySnapshot(s: RoomSnapshot): View {
  const users = s.users.map(toRow)
  const me = users.find(u => u.id === s.you)
  const tally: Record<string, number> = {}
  // Whoever has an estimation, which is what the table renders. Not u.voted: that drops a
  // re-vote in progress, where the value stands and the confirmation does not.
  users.forEach(u => {
    if (u.hasEstimation) tally[u.estimation] = (tally[u.estimation] || 0) + 1
  })
  return {
    // Sorted after the tally, which reads the snapshot's order, so tied values stay as they were.
    users: [...users].sort(byName),
    votesRevealed: s.votesRevealed,
    currentIssue: s.currentIssue,
    userEstimation: me ? me.estimation : '',
    ownVoteConfirmed: !me || me.voted || !me.estimation,
    votesSummary: Object.entries(tally).sort((a, b) => b[1] - a[1])
  }
}
