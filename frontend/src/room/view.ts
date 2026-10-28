import type { Estimation, Participant, RoomSnapshot, Seat } from '../protocol/snapshot'

// What the table renders per participant, read off the union in one place.
export type ParticipantRow = {
  id: string
  name: string
  facilitator: boolean
  // The reader's own row.
  self: boolean
  voted: boolean
  hasEstimation: boolean
  estimation: string
}

// A voter's entry as drawn: confirmed, kept from before a Re-vote, or no vote.
export type VoteState = 'confirmed' | 'kept' | 'none'
export const voteState = (u: ParticipantRow): VoteState =>
  u.voted ? 'confirmed' : u.hasEstimation ? 'kept' : 'none'

const confirmed = (e: Estimation) => e.type === 'Confirmed' || e.type === 'ConfirmedHidden'
const shown = (e: Estimation) =>
  e.type === 'Confirmed' || e.type === 'Unconfirmed' ? e.value : ''

// A facilitator's row has no estimation, so the tally leaves them out without a rule of its own.
const estimationOf = (seat: Seat): Estimation =>
  seat.type === 'Voter' ? seat.estimation : { type: 'NoEstimation' }

const toRow = (you: string) => ({ id, name, seat }: Participant): ParticipantRow => {
  const estimation = estimationOf(seat)
  return {
    id,
    name,
    facilitator: seat.type === 'Facilitator',
    self: id === you,
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
  ownRole: Seat['type'] | null
  users: ParticipantRow[]
  votesRevealed: boolean
  currentIssue: string
  userEstimation: string
  ownVoteConfirmed: boolean
  votesSummary: [string, number][]
}

// Null only for a snapshot without the reader, which the server never sends.
export const ownRoleOf = (s: RoomSnapshot): Seat['type'] | null =>
  s.users.find(u => u.id === s.you)?.seat.type ?? null

export function applySnapshot(s: RoomSnapshot): View {
  const users = s.users.map(toRow(s.you))
  const me = users.find(u => u.self)
  const tally: Record<string, number> = {}
  // Whoever has an estimation, which is what the table renders. Not u.voted: that drops a
  // re-vote in progress, where the value stands and the confirmation does not.
  users.forEach(u => {
    if (u.hasEstimation) tally[u.estimation] = (tally[u.estimation] || 0) + 1
  })
  return {
    ownRole: ownRoleOf(s),
    // Sorted after the tally, which reads the snapshot's order, so tied values stay as they were.
    users: [...users].sort(byName),
    votesRevealed: s.votesRevealed,
    currentIssue: s.currentIssue,
    userEstimation: me ? me.estimation : '',
    ownVoteConfirmed: !me || me.voted || !me.estimation,
    votesSummary: Object.entries(tally).sort((a, b) => b[1] - a[1])
  }
}
