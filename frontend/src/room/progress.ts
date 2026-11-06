import { voteState, type ParticipantRow, type VoteState } from './view'

export type NameLine = { label: 'No vote' | 'Not confirmed'; names: string[] }
export type RoundProgress = { voted: number; total: number; bar: VoteState[]; lines: NameLine[] }

const order: VoteState[] = ['confirmed', 'kept', 'none']

// The round's progress over the voters, already without facilitators, in table order; null when none.
export function progress(voters: ParticipantRow[]): RoundProgress | null {
  if (voters.length === 0) return null
  const states = voters.map(voteState)
  const namesIn = (s: VoteState) => voters.filter((_, i) => states[i] === s).map(u => u.name)
  const lines: NameLine[] = [
    { label: 'No vote', names: namesIn('none') },
    { label: 'Not confirmed', names: namesIn('kept') }
  ].filter((l): l is NameLine => l.names.length > 0)
  return {
    voted: states.filter(s => s === 'confirmed').length,
    total: voters.length,
    bar: order.flatMap(s => states.filter(x => x === s)),
    lines
  }
}
