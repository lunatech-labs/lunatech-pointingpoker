import { CircleCheckBig, ShieldOff } from 'lucide-react'
import type { View } from '../room/view'

export function Participants({ view }: { view: View }) {
  return (
    <div className="row mt-4" role="region" aria-label="Participants">
      <div className="col-md-12">
        <table className="table table-hover">
          <thead>
            <tr>
              <th>Voted</th>
              <th>Name</th>
              <th>Estimation</th>
            </tr>
          </thead>
          <tbody>
            {view.users.map(u => (
              <tr key={u.id} data-testid="participant">
                <td>
                  {u.facilitator
                    ? 'Facilitator'
                    : u.voted && <CircleCheckBig size={20} role="img" aria-label="Voted" />}
                </td>
                <td>{u.name}</td>
                <td>
                  {u.hasEstimation && !view.votesRevealed && (
                    <ShieldOff size={20} role="img" aria-label="Vote hidden" />
                  )}
                  {view.votesRevealed && (
                    <div data-testid="participant-estimation">{u.estimation}</div>
                  )}
                  {/* Interim, until Task 6's Voters: a revealed voter's mark for no vote. */}
                  {view.votesRevealed && !u.facilitator && !u.hasEstimation && (
                    <span role="img" aria-label="No vote">
                      –
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
