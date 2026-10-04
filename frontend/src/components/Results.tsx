import type { View } from '../room/view'

export function Results({ view }: { view: View }) {
  // The length guard is not defensive: the tally is empty after a Show where nobody voted.
  if (!view.votesRevealed || view.votesSummary.length === 0) return null
  return (
    <div className="row mt-4" role="region" aria-label="Results">
      <div className="col">
        <div className="summary-card">
          <div className="row">
            <div className="col mt-2">
              <h6>Most voted estimation</h6>
            </div>
          </div>
          <div className="row">
            <div className="col">
              <div className="estimation-text" data-testid="most-voted">
                {view.votesSummary[0][0]}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="col">
        <table className="table table-hover">
          <thead>
            <tr>
              <th>Estimation</th>
              <th>Number of votes</th>
            </tr>
          </thead>
          <tbody>
            {view.votesSummary.map(([estimation, count]) => (
              <tr key={estimation} data-testid="tally-entry">
                <td data-testid="tally-value">{estimation}</td>
                <td data-testid="tally-count">{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
