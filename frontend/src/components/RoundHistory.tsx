import './round-history.css'
import { useId, useRef, useState } from 'react'
import type { Entry } from '../protocol/snapshot'
import { shortForm } from '../room/history'
import { Figure } from './Figure'
import { useStickToEnd } from './useStickToEnd'

// A row: the issue's short form, a link cut at its front and text at its end, then the outcome.
function Row({ entry, position }: { entry: Entry; position: number }) {
  const short = shortForm(entry.issue, position)
  return (
    <li>
      {short.kind === 'link' ? (
        <span className="round-history-issue round-history-link">
          <bdi dir="ltr">{short.text}</bdi>
        </span>
      ) : (
        <span className="round-history-issue" dir="auto">
          {short.text}
        </span>
      )}{' '}
      <span className="round-history-outcome">
        {entry.outcome.type === 'Estimate' ? <Figure value={entry.outcome.value} /> : 'Unsettled'}
      </span>
    </li>
  )
}

// The panel once there is an entry, so the list is there when its hook first runs.
function Panel({ history }: { history: Entry[] }) {
  const label = useId()
  const list = useRef<HTMLOListElement>(null)
  // The phone panel's state, the page's own: kept across snapshots, closed on a reload.
  const [open, setOpen] = useState(false)
  useStickToEnd(list, history.length)
  return (
    <section
      className={open ? 'panel round-history round-history-open' : 'panel round-history'}
      aria-labelledby={label}
    >
      <div className="round-history-head">
        <h2 className="panel-label" id={label}>
          Rounds · {history.length}
        </h2>
        {history.length > 1 && (
          <button
            type="button"
            className="button-quiet round-history-toggle"
            aria-expanded={open}
            onClick={() => setOpen(o => !o)}
          >
            {open ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
      <ol ref={list} tabIndex={0} aria-labelledby={label}>
        {history.map((entry, i) => (
          <Row key={i} entry={entry} position={i + 1} />
        ))}
      </ol>
    </section>
  )
}

// The room's recorded rounds, oldest first (round history decision 6); nothing while there are none.
export function RoundHistory({ history }: { history: Entry[] }) {
  return history.length === 0 ? null : <Panel history={history} />
}
