import { CircleCheckBig, ShieldOff } from 'lucide-react'
import type { View } from '../room/view'

export function Participants({ view }: { view: View }) {
  return (
    <div className="row mt-4">
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
              <tr key={u.id}>
                <td>{u.voted && <CircleCheckBig size={20} />}</td>
                <td>{u.name}</td>
                <td>
                  {u.hasEstimation && !view.votesRevealed && <ShieldOff size={20} />}
                  {view.votesRevealed && <div>{u.estimation}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
