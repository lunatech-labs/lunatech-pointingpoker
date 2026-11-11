import './room-page.css'
import { type FocusEvent, type ReactNode, useRef } from 'react'
import * as api from '../protocol/api'
import type { Role, RoomSnapshot } from '../protocol/snapshot'
import { applySnapshot } from '../room/view'
import { RoomHeader } from './RoomHeader'
import { IssuePanel } from './IssuePanel'
import { RoundPanel } from './RoundPanel'
import { RoundBar } from './RoundBar'
import { NextIssueDialog } from './NextIssueDialog'
import { useNextIssue } from './useNextIssue'
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
  banners: ReactNode
}

const log = (reason: unknown) => console.log(reason)

// Firefox leaves a tall focus, the table, behind the pinned sheet, so a keyboard focus not
// wholly in view above the round panel, the sheet's top, scrolls to the top (3b2 decision 7).
function keepClearOfSheet(event: FocusEvent<HTMLDivElement>): void {
  const page = event.currentTarget
  const target: EventTarget = event.target
  const bar = page.querySelector('.round-bar')
  const panel = page.querySelector('.round-panel')
  if (!(target instanceof Element) || !target.matches(':focus-visible')) return
  if (!bar || !panel || getComputedStyle(bar).position !== 'sticky') return
  if (target.closest('.round-panel, .round-bar, dialog')) return
  const sheetTop = panel.getBoundingClientRect().top
  const box = target.getBoundingClientRect()
  if (box.top < 0 || box.bottom > sheetTop) target.scrollIntoView({ block: 'start' })
}

export function RoomPage(props: Props) {
  const { roomId, snapshot, copied, onCopied, onLeave, onRefused, onSwitched, banners } = props
  const view = applySnapshot(snapshot)

  const report = (reason: unknown) => (api.isSessionRefusal(reason) ? onRefused() : log(reason))
  const run = (promise: Promise<void>) => promise.catch(report)
  // A form shows its own failure, so the rejection goes back to it once reported.
  const reported = (promise: Promise<void>) =>
    promise.catch((reason: unknown) => {
      report(reason)
      throw reason
    })
  const saveIssue = (issue: string) => reported(api.editIssue(roomId, issue))

  const vote = (estimation: string) => run(api.vote(roomId, estimation))
  const next = useNextIssue(view.currentIssue, view.round, (round, issue) =>
    reported(api.nextIssue(roomId, round, issue))
  )
  const nextRef = useRef<HTMLButtonElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

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
        />
        {banners}
        <main className="room-page-main">
          <div className="room-page-column">
            <IssuePanel issue={view.currentIssue} round={view.round} onSave={saveIssue} />
            <Voters view={view} />
            <RoundPanel view={view} onVote={vote} />
            <RoundBar
              revealed={view.votesRevealed}
              onShow={() => run(api.command(roomId, 'show'))}
              onRevote={() => run(api.command(roomId, 'revote'))}
              onClear={() => run(api.command(roomId, 'clear'))}
              onNext={next.open}
              nextRef={nextRef}
              toggleRef={toggleRef}
            />
          </div>
          <div className="room-page-sidebar">
            <Roster view={view} />
          </div>
        </main>
      </div>
      {/* Outside the round bar, so it survives the phase change (spec decision 7). */}
      <NextIssueDialog
        next={next}
        issue={view.currentIssue}
        onClosed={() => (nextRef.current ?? toggleRef.current)?.focus()}
      />
    </div>
  )
}
