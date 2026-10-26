import './room-page.css'
import * as api from '../protocol/api'
import type { Role, RoomSnapshot } from '../protocol/snapshot'
import { applySnapshot } from '../room/view'
import { RoomHeader } from './RoomHeader'
import { IssuePanel } from './IssuePanel'
import { RoundPanel } from './RoundPanel'
import { RoundBar } from './RoundBar'
import { Voters } from './Voters'
import { Roster } from './Roster'

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

  const vote = (estimation: string) => run(api.vote(roomId, estimation))

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
            <Voters view={view} />
            <RoundPanel view={view} onVote={vote} />
            <RoundBar
              revealed={view.votesRevealed}
              onShow={() => run(api.command(roomId, 'show'))}
              onRevote={() => run(api.command(roomId, 'revote'))}
              onClear={() => run(api.command(roomId, 'clear'))}
            />
          </div>
          <div className="room-page-sidebar">
            <Roster view={view} />
          </div>
        </main>
      </div>
    </div>
  )
}
