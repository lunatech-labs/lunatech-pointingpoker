import type { JoinOutcome } from '../protocol/api'

export type JoinAction =
  | { kind: 'enter' }
  | { kind: 'retarget'; path: string }
  | { kind: 'show-error'; message: string }

// A not-a-room outcome for the path we are already on cannot be fixed by reloading it: the
// server decides the same way again from the same URL, so retargeting here only loops.
export function joinAction(outcome: JoinOutcome, id: string, pathRoom: string): JoinAction {
  if (outcome === 'joined') return { kind: 'enter' }
  if (id === pathRoom) return { kind: 'show-error', message: 'Could not join the room. Please try again.' }
  return { kind: 'retarget', path: '/' + encodeURIComponent(id) }
}
