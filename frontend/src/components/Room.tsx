import * as api from '../protocol/api'
import type { RoomSnapshot } from '../protocol/snapshot'
import { applySnapshot } from '../room/view'
import { Controls } from './Controls'
import { Deck } from './Deck'
import { IssueEditor } from './IssueEditor'
import { Participants } from './Participants'
import { Results } from './Results'
import { RoleLine } from './RoleLine'
import { RoomHeader } from './RoomHeader'

type Props = {
  roomId: string
  snapshot: RoomSnapshot
  onCopied: () => void
  onLeave: () => void
  onRefused: () => void
}

const log = (reason: unknown) => console.log(reason)

export function Room({ roomId, snapshot, onCopied, onLeave, onRefused }: Props) {
  const view = applySnapshot(snapshot)

  const report = (reason: unknown) => (api.isSessionRefusal(reason) ? onRefused() : log(reason))
  const run = (promise: Promise<void>) => promise.catch(report)
  // The editor shows its own failure, so the rejection goes back to it once reported.
  const saveIssue = (issue: string) =>
    api.editIssue(roomId, issue).catch((reason: unknown) => {
      report(reason)
      throw reason
    })

  const vote = (estimation: string) => {
    // The server refuses it anyway; this only spares the doomed POST.
    if (view.votesRevealed) return
    run(api.vote(roomId, estimation))
  }

  return (
    <div className="row">
      <div className="col-md-8 offset-md-2">
        <div className="card text-center shadow-sm m-1">
          <RoomHeader roomId={roomId} onCopied={onCopied} onLeave={onLeave} />
          <div className="card-body">
            {view.ownRole && (
              <RoleLine
                role={view.ownRole}
                onSwitch={role => run(api.switchRole(roomId, role))}
              />
            )}
            <IssueEditor issue={view.currentIssue} onSave={saveIssue} />
            {view.ownRole !== 'Facilitator' && <Deck view={view} onVote={vote} />}
            <Controls
              revealed={view.votesRevealed}
              onShow={() => run(api.command(roomId, 'show'))}
              onRevote={() => run(api.command(roomId, 'revote'))}
              onClear={() => run(api.command(roomId, 'clear'))}
            />
            <Results view={view} />
            <Participants view={view} />
          </div>
        </div>
      </div>
    </div>
  )
}
