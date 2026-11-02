import './result.css'
import type { CSSProperties } from 'react'
import { resultColumns } from '../room/result'
import { estimationValues } from './Deck'
import { Figure } from './Figure'

// The most voted is the first of the summary, today's tie-break (decision 10).
export function Result({ summary }: { summary: [string, number][] }) {
  const [first, top] = summary[0] ?? ['', 0]
  const votes = summary.reduce((n, [, count]) => n + count, 0)
  return (
    <div className="result" role="region" aria-label="Results">
      <div className="result-most">
        {summary.length ? (
          <>
            <span className="panel-label">Most voted</span>
            <span className="result-figure" data-testid="most-voted">
              <Figure value={first} />
            </span>
            <span className="result-sub">
              {top} of {votes} votes
            </span>
          </>
        ) : (
          <span className="panel-label">Nobody voted</span>
        )}
      </div>
      <div className="result-columns" role={summary.length ? 'list' : undefined}>
        {resultColumns(estimationValues, summary).map(([value, count]) =>
          count ? (
            <div
              key={value}
              className={value === first ? 'result-column result-column-top' : 'result-column'}
              role="listitem"
              data-testid="tally-entry"
            >
              <span className="result-sr">
                {value}: {count} {count > 1 ? 'votes' : 'vote'}
              </span>
              <span className="result-count" aria-hidden="true" data-testid="tally-count">
                {count}
              </span>
              <span
                className="result-bar"
                style={{ '--share': count / top } as CSSProperties}
                aria-hidden="true"
              />
              <span className="result-value" aria-hidden="true" data-testid="tally-value">
                <Figure value={value} />
              </span>
            </div>
          ) : (
            <div key={value} className="result-column result-column-empty" aria-hidden="true">
              <span className="result-value">
                <Figure value={value} />
              </span>
            </div>
          )
        )}
      </div>
    </div>
  )
}
