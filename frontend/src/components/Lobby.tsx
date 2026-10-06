import { useId, type KeyboardEvent, type MouseEvent } from 'react'
import type { Role } from '../protocol/snapshot'
import { DefaultRole } from './DefaultRole'

export type LobbyTab = 'create' | 'join'

type Props = {
  tab: LobbyTab
  onTab: (tab: LobbyTab) => void
  roomId: string
  // On a room's own path, where the room is the path's and only the name is asked.
  fixedRoom: boolean
  onRoomId: (roomId: string) => void
  name: string
  onName: (name: string) => void
  defaultRole: Role
  // From the default stored at load (decision 7), and only Change sets it again.
  choosingRole: boolean
  onChooseRole: (role: Role) => void
  onChangeRole: () => void
  rejoin: { href: string; label: string } | null
  // A session that has ended: further clicks would be ignored, so the form is inert instead.
  disabled: boolean
  onCreate: () => void
  onJoin: () => void
}

const onEnter = (action: () => void) => (event: KeyboardEvent) => {
  if (event.key === 'Enter') action()
}

export function Lobby(props: Props) {
  const {
    tab,
    onTab,
    roomId,
    fixedRoom,
    onRoomId,
    name,
    onName,
    defaultRole,
    choosingRole,
    onChooseRole,
    onChangeRole,
    rejoin,
    disabled,
    onCreate,
    onJoin
  } = props
  const nameId = useId()
  const select = (next: LobbyTab) => (event: MouseEvent) => {
    event.preventDefault()
    onTab(next)
  }
  const tabClass = (which: LobbyTab) => (tab === which ? 'nav-link active' : 'nav-link')
  const roleRow = (
    <DefaultRole
      role={defaultRole}
      choosing={choosingRole}
      disabled={disabled}
      onChoose={onChooseRole}
      onChange={onChangeRole}
    />
  )
  const nameRow = (action: () => void) => (
    <div className="form-group row">
      <label htmlFor={nameId} className="col-sm-3 col-form-label">
        User name
      </label>
      <div className="col-sm-9">
        <input
          id={nameId}
          type="text"
          className="form-control"
          value={name}
          disabled={disabled}
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
            <ul className="nav nav-tabs card-header-tabs" hidden={fixedRoom}>
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
          {rejoin && (
            <div className="card-body pb-0">
              <a href={rejoin.href}>{rejoin.label}</a>
            </div>
          )}
          {tab === 'create' && (
            <div className="card-body">
              <h5 className="card-title">Create Room</h5>
              {nameRow(onCreate)}
              {roleRow}
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
                    readOnly={fixedRoom}
                    onChange={e => onRoomId(e.target.value)}
                  />
                </div>
              </div>
              {nameRow(onJoin)}
              {roleRow}
              <div className="row">
                <div className="col-sm-3 offset-sm-9">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={disabled}
                    onClick={onJoin}
                  >
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
