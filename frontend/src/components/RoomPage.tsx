import './room-page.css'
import { useRef, type FocusEvent } from 'react'
import * as api from '../protocol/api'
import type { Role, RoomSnapshot } from '../protocol/snapshot'
import { applySnapshot } from '../room/view'
import { Message } from './Message'
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
  lost: boolean
  moved: boolean
  restarted: boolean
  onDismissMoved: () => void
  onDismissRestarted: () => void
}

const log = (reason: unknown) => console.log(reason)

// Firefox leaves a tall focus, the table, behind the pinned sheet, so a keyboard focus not
// wholly in view above the sheet scrolls to the top (3b2 decision 7).
function keepClearOfSheet(event: FocusEvent<HTMLDivElement>): void {
  const page = event.currentTarget
  const target: EventTarget = event.target
  const bar = page.querySelector('.round-bar')
  if (!(target instanceof Element) || !target.matches(':focus-visible')) return
  if (!bar || getComputedStyle(bar).position !== 'sticky') return
  if (target.closest('.round-panel, .round-bar')) return
  const sheetTop = (page.querySelector('.round-panel') ?? bar).getBoundingClientRect().top
  const box = target.getBoundingClientRect()
  if (box.top < 0 || box.bottom > sheetTop) target.scrollIntoView({ block: 'start' })
}

export function RoomPage(props: Props) {
  const { roomId, snapshot, copied, onCopied, onLeave, onRefused, onSwitched } = props
  const { lost, moved, restarted, onDismissMoved, onDismissRestarted } = props
  const view = applySnapshot(snapshot)
  const id = useRef<HTMLHeadingElement>(null)
  // A Dismiss focuses the room id as its notice leaves (4c1-banners decision 4).
  const dismiss = (onDismiss: () => void) => () => {
    id.current?.focus()
    onDismiss()
  }

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
    <div className="room-page" data-testid="room" onFocus={keepClearOfSheet}>
      <div className="room-page-stack">
        <RoomHeader
          roomId={roomId}
          role={view.ownRole}
          copied={copied}
          onCopy={onCopied}
          onLeave={onLeave}
          onSwitch={role => run(api.switchRole(roomId, role).then(() => onSwitched(role)))}
          idRef={id}
        />
        {(lost || moved || restarted) && (
          <section className="room-page-banners" aria-label="Messages">
            {lost && (
              <Message tone="problem" role="alert">
                Connection to the room was lost
              </Message>
            )}
            {moved && (
              <Message tone="notice" role="status" onDismiss={dismiss(onDismissMoved)}>
                The old link you followed now opens this address. Please update your invitation or
                bookmark to use it.
              </Message>
            )}
            {restarted && (
              <Message tone="notice" role="status" onDismiss={dismiss(onDismissRestarted)}>
                Reconnected. Please check your vote.
              </Message>
            )}
          </section>
        )}
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
