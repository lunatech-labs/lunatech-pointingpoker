import './room-page.css'
import * as api from '../protocol/api'
import type { Role, RoomSnapshot } from '../protocol/snapshot'
import { applySnapshot } from '../room/view'
import { RoomHeader } from './RoomHeader'
import { IssuePanel } from './IssuePanel'
import { Deck } from './Deck'
import { Results } from './Results'
import { Controls } from './Controls'
import { Participants } from './Participants'

type Props = {
  roomId: string
  snapshot: RoomSnapshot
  copied: boolean
  onCopied: () => void
  onLeave: () => void
  onRefused: () => void
  // A 204 from /role, which the page remembers before any snapshot shows it.
  onSwitched: (role: Role) => void
}

const log = (reason: unknown) => console.log(reason)

export function RoomPage(props: Props) {
  const { roomId, snapshot, copied, onCopied, onLeave, onRefused, onSwitched } = props
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
    <div className="room-page" data-testid="room">
      <div className="room-page-stack">
        <RoomHeader
          roomId={roomId}
          role={view.ownRole}
          copied={copied}
          onCopy={onCopied}
          onLeave={onLeave}
          onSwitch={role => run(api.switchRole(roomId, role).then(() => onSwitched(role)))}
        />
        <main className="room-page-main">
          <div className="room-page-column">
            <IssuePanel issue={view.currentIssue} onSave={saveIssue} />
            {/* Interim, until Task 6: the parts not yet moved keep today's look. */}
            <div className="legacy-page">
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
          <div className="room-page-sidebar" />
        </main>
      </div>
    </div>
  )
}
