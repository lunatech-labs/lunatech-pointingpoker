import type { JoinOutcome } from '../protocol/api'

export type JoinAction =
  | { kind: 'enter' }
  | { kind: 'retarget'; path: string }
  | { kind: 'show-error' }

// Retargeting to the path we are already on only reloads it: under Vite that loops, and on
// the server it is the empty id on `/`, which reloads the same lobby.
export function joinAction(outcome: JoinOutcome, id: string, pathRoom: string): JoinAction {
  if (outcome === 'joined') return { kind: 'enter' }
  if (id === pathRoom) return { kind: 'show-error' }
  return { kind: 'retarget', path: '/' + encodeURIComponent(id) }
}
