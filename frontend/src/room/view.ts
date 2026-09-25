import type { Participant, RoomSnapshot } from '../protocol/snapshot'

export type ParticipantRow = Participant

export type View = {
  users: ParticipantRow[]
  votesRevealed: boolean
  currentIssue: string
  userEstimation: string
  ownVoteConfirmed: boolean
  votesSummary: [string, number][]
}

// prev carries only what the next view depends on; step 8b removes issueFocused.
export type Previous = { issueFocused: boolean; currentIssue: string }

export function applySnapshot(prev: Previous, s: RoomSnapshot): View {
  const me = s.users.find(u => u.id === s.you)
  const tally: Record<string, number> = {}
  // Whoever has an estimation, which is what the table renders. Not u.voted: that drops a
  // re-vote in progress, where the value stands and the confirmation does not.
  s.users.forEach(u => {
    if (u.hasEstimation) tally[u.estimation] = (tally[u.estimation] || 0) + 1
  })
  return {
    users: s.users,
    votesRevealed: s.votesRevealed,
    // Do not clobber the issue input while the user is typing in it.
    currentIssue: prev.issueFocused ? prev.currentIssue : s.currentIssue,
    userEstimation: me ? me.estimation : '',
    ownVoteConfirmed: !me || me.voted || !me.estimation,
    votesSummary: Object.entries(tally).sort((a, b) => b[1] - a[1])
  }
}
