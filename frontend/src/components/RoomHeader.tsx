import type { MouseEvent } from 'react'

type Props = { roomId: string; onCopied: () => void; onLeave: () => void }

export function RoomHeader({ roomId, onCopied, onLeave }: Props) {
  const copy = (event: MouseEvent) => {
    event.preventDefault()
    const el = document.createElement('textarea')
    el.value = window.location.origin + '/' + roomId
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
    onCopied()
  }
  const leave = (event: MouseEvent) => {
    event.preventDefault()
    onLeave()
  }
  return (
    <div className="card-header">
      <div className="row align-items-center">
        <div className="col">
          <h2>Pointing Poker</h2>
        </div>
        <div className="col">
          <div className="row">
            <div className="col">
              <h5 className="card-title">{roomId}</h5>
            </div>
          </div>
          <div className="row">
            <div className="col">
              <a className="nav-link" href="#" onClick={copy}>
                Copy link
              </a>
            </div>
            <div className="col">
              <a className="nav-link" href="#" onClick={leave}>
                Leave
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
