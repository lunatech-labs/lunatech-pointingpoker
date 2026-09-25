import type { KeyboardEvent, MouseEvent } from 'react'

export type LobbyTab = 'create' | 'join'

type Props = {
  tab: LobbyTab
  onTab: (tab: LobbyTab) => void
  roomId: string
  onRoomId: (roomId: string) => void
  name: string
  onName: (name: string) => void
  onCreate: () => void
  onJoin: () => void
}

const onEnter = (action: () => void) => (event: KeyboardEvent) => {
  if (event.key === 'Enter') action()
}

export function Lobby(props: Props) {
  const { tab, onTab, roomId, onRoomId, name, onName, onCreate, onJoin } = props
  const select = (next: LobbyTab) => (event: MouseEvent) => {
    event.preventDefault()
    onTab(next)
  }
  const tabClass = (which: LobbyTab) => (tab === which ? 'nav-link active' : 'nav-link')
  const nameRow = (action: () => void) => (
    <div className="form-group row">
      <label className="col-sm-3 col-form-label">User name</label>
      <div className="col-sm-9">
        <input
          type="text"
          className="form-control"
          value={name}
          onChange={e => onName(e.target.value)}
          onKeyUp={onEnter(action)}
        />
      </div>
    </div>
  )
  return (
    <div className="row">
      <div className="col-md-8 offset-md-2">
        <div className="card text-center shadow-sm m-1">
          <div className="card-header">
            Pointing Poker
            <ul className="nav nav-tabs card-header-tabs">
              <li className="nav-item">
                <a className={tabClass('create')} href="#" onClick={select('create')}>
                  Create
                </a>
              </li>
              <li className="nav-item">
                <a className={tabClass('join')} href="#" onClick={select('join')}>
                  Join
                </a>
              </li>
            </ul>
          </div>
          {tab === 'create' && (
            <div className="card-body">
              <h5 className="card-title">Create Room</h5>
              {nameRow(onCreate)}
              <div className="row">
                <div className="col-sm-3 offset-sm-9">
                  <button type="button" className="btn btn-primary" onClick={onCreate}>
                    Create
                  </button>
                </div>
              </div>
            </div>
          )}
          {tab === 'join' && (
            <div className="card-body">
              <h5 className="card-title">Join Room</h5>
              <div className="form-group row">
                <label htmlFor="join-roomId" className="col-sm-3 col-form-label">
                  Room id
                </label>
                <div className="col-sm-9">
                  <input
                    type="text"
                    className="form-control"
                    id="join-roomId"
                    value={roomId}
                    onChange={e => onRoomId(e.target.value)}
                  />
                </div>
              </div>
              {nameRow(onJoin)}
              <div className="row">
                <div className="col-sm-3 offset-sm-9">
                  <button type="button" className="btn btn-primary" onClick={onJoin}>
                    Join
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
