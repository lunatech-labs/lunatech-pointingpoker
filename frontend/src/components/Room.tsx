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

type Props = {
  roomId: string
  snapshot: RoomSnapshot
  onCopied: () => void
  onLeave: () => void
  onRefused: () => void
}

const log = (reason: unknown) => console.log(reason)

export function Room({ roomId, snapshot, onCopied, onLeave, onRefused }: Props) {
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

  const run = (promise: Promise<void>) =>
    promise.catch(reason => (api.isSessionRefusal(reason) ? onRefused() : log(reason)))

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
            <IssueEditor
              issue={view.currentIssue}
              onIssue={currentIssue => setView(v => ({ ...v, currentIssue }))}
              onFocusChange={setIssueFocused}
              onCommit={() => run(api.editIssue(roomId, view.currentIssue))}
            />
            <Deck view={view} onVote={vote} />
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
