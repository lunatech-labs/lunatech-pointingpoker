import './result.css'
import { Fragment, type CSSProperties } from 'react'
import { resultColumns, resultHeadline } from '../room/result'
import { estimationValues } from './Deck'
import { Figure } from './Figure'

export function Result({ summary }: { summary: [string, number][] }) {
  const head = resultHeadline(estimationValues, summary)
  const top = summary[0]?.[1] ?? 0
  return (
    <div className="result" role="region" aria-label="Results">
      <div className="result-most">
        <span className="panel-label">{head.label}</span>
        {head.figure.length > 0 && (
          <>
            <span
              className={
                head.figure.length > 1 ? 'result-figure result-figure-list' : 'result-figure'
              }
              data-testid="most-voted"
              aria-hidden="true"
            >
              {head.figure.map((value, i) => (
                <Fragment key={value}>
                  {i > 0 && ' · '}
                  <Figure value={value} />
                </Fragment>
              ))}
            </span>
            <span className="visually-hidden">{head.spoken}</span>
            <span className="result-sub">{head.sub}</span>
          </>
        )}
      </div>
      <div className="result-columns" role={summary.length ? 'list' : undefined}>
        {resultColumns(estimationValues, summary).map(([value, count]) =>
          count ? (
            <div
              key={value}
              className={
                head.tied.includes(value) ? 'result-column result-column-top' : 'result-column'
              }
              role="listitem"
              data-testid="tally-entry"
            >
              <span className="visually-hidden" data-testid="tally-sr">
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
