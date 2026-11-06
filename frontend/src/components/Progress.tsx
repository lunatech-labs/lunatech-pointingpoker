import './progress.css'
import { progress, type NameLine as Line } from '../room/progress'
import type { ParticipantRow } from '../room/view'
import { useFitLine } from './useFitLine'

// One line, never wrapping: every name, then the first few and "and N more", then the count.
function NameLine({ label, names }: Line) {
  const { line, text } = useFitLine(label, names)
  return (
    <p ref={line} className="progress-line">
      <b>{label}:</b> {text}
    </p>
  )
}

// The facilitator's slot while voting: the count, the bar and who has yet to vote, read on demand.
export function Progress({ voters }: { voters: ParticipantRow[] }) {
  const round = progress(voters)
  return (
    <div className="progress" role="region" aria-label="Progress">
      {round ? (
        <>
          <p className="progress-count">{`${round.voted} of ${round.total} voted`}</p>
          <div className="progress-bar" aria-hidden="true">
            {round.bar.map((state, i) => (
              <span key={i} className={`progress-segment-${state}`} />
            ))}
          </div>
          <div className="progress-lines">
            {round.lines.length ? (
              round.lines.map(l => <NameLine key={l.label} {...l} />)
            ) : (
              <p className="progress-line">Everybody voted</p>
            )}
          </div>
        </>
      ) : (
        <p className="progress-line">No voters yet</p>
      )}
    </div>
  )
}
