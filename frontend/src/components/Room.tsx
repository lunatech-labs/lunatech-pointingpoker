import { useState } from 'react'
import * as api from '../protocol/api'
import type { RoomSnapshot } from '../protocol/snapshot'
import { applySnapshot, type View } from '../room/view'
import { Controls } from './Controls'
import { Deck } from './Deck'
import { IssueEditor } from './IssueEditor'
import { Participants } from './Participants'
import { Results } from './Results'
import { RoomHeader } from './RoomHeader'

type Props = { roomId: string; snapshot: RoomSnapshot; onCopied: () => void; onLeave: () => void }

const log = (reason: unknown) => console.log(reason)

export function Room({ roomId, snapshot, onCopied, onLeave }: Props) {
  const [issueFocused, setIssueFocused] = useState(false)
  const [seen, setSeen] = useState(snapshot)
  const [view, setView] = useState<View>(() =>
    applySnapshot({ issueFocused: false, currentIssue: '' }, snapshot)
  )
  // A new snapshot folds into the view during render, so no frame renders a stale view.
  if (snapshot !== seen) {
    setSeen(snapshot)
    setView(applySnapshot({ issueFocused, currentIssue: view.currentIssue }, snapshot))
  }

  const vote = (estimation: string) => {
    // The server refuses it anyway; this only spares the doomed POST.
    if (view.votesRevealed) return
    api.vote(roomId, estimation).catch(log)
  }

  return (
    <div className="row">
      <div className="col-md-8 offset-md-2">
        <div className="card text-center shadow-sm m-1">
          <RoomHeader roomId={roomId} onCopied={onCopied} onLeave={onLeave} />
          <div className="card-body">
            <IssueEditor
              issue={view.currentIssue}
              onIssue={currentIssue => setView(v => ({ ...v, currentIssue }))}
              onFocusChange={setIssueFocused}
              onCommit={() => api.editIssue(roomId, view.currentIssue).catch(log)}
            />
            <Deck view={view} onVote={vote} />
            <Controls
              revealed={view.votesRevealed}
              onShow={() => api.command(roomId, 'show').catch(log)}
              onRevote={() => api.command(roomId, 'revote').catch(log)}
              onClear={() => api.command(roomId, 'clear').catch(log)}
            />
            <Results view={view} />
            <Participants view={view} />
          </div>
        </div>
      </div>
    </div>
  )
}
