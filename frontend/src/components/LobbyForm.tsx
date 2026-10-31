import './lobby-form.css'
import { useId, type KeyboardEvent } from 'react'
import type { Role } from '../protocol/snapshot'
import { roles } from '../room/joinRole'
import { LobbyTabs, type LobbyTab } from './LobbyTabs'
import { RoomRow } from './RoomRow'

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
  onChooseRole: (role: Role) => void
  rejoin: { href: string; id: string; line2: string; onClick: () => void } | null
  // A session that has ended: further clicks would be ignored, so the form is inert instead.
  disabled: boolean
  onCreate: () => void
  onJoin: () => void
}

const onEnter = (action: () => void) => (event: KeyboardEvent) => {
  if (event.key === 'Enter') action()
}

// 3b4's root and pinned forms; Enter submits from the name field alone (4c2-form decision 7).
export function LobbyForm(props: Props) {
  const {
    tab,
    onTab,
    roomId,
    fixedRoom,
    onRoomId,
    name,
    onName,
    defaultRole,
    onChooseRole,
    rejoin,
    disabled,
    onCreate,
    onJoin
  } = props
  const id = useId()
  return (
    <>
      <h1 className="lobby-page-title" tabIndex={-1}>
        {tab === 'create' ? 'Create room' : 'Join room'}
      </h1>
      {fixedRoom ? (
        <RoomRow id={roomId} />
      ) : (
        rejoin && (
          <RoomRow
            id={rejoin.id}
            line2={rejoin.line2}
            href={rejoin.href}
            onClick={rejoin.onClick}
          />
        )
      )}
      {!fixedRoom && <LobbyTabs tab={tab} onTab={onTab} />}
      {tab === 'join' && !fixedRoom && (
        <>
          <label className="lobby-form-label" htmlFor={`${id}-room`}>
            Room id
          </label>
          <input
            id={`${id}-room`}
            type="text"
            className="lobby-form-input lobby-form-input-mono"
            value={roomId}
            onChange={e => onRoomId(e.target.value)}
          />
        </>
      )}
      <label className="lobby-form-label" htmlFor={`${id}-name`}>
        Your name
      </label>
      <input
        id={`${id}-name`}
        type="text"
        className="lobby-form-input"
        value={name}
        disabled={disabled}
        onChange={e => onName(e.target.value)}
        onKeyUp={onEnter(tab === 'create' ? onCreate : onJoin)}
      />
      <fieldset className="lobby-form-roles" aria-describedby={`${id}-help`}>
        <legend className="lobby-form-label">Your default role</legend>
        <div className="lobby-form-radios">
          {roles.map(r => (
            <label className="lobby-form-label" key={r}>
              <input
                className="lobby-form-radio"
                type="radio"
                name={`${id}-role`}
                checked={defaultRole === r}
                disabled={disabled}
                onChange={() => onChooseRole(r)}
              />
              {r}
            </label>
          ))}
        </div>
        <small id={`${id}-help`} className="lobby-form-help">
          Used for rooms you have not joined before. In a room you have joined
          before, you keep your previous role there.
        </small>
      </fieldset>
      {tab === 'create' ? (
        <button type="button" className="button button-primary" onClick={onCreate}>
          Create
        </button>
      ) : (
        <button
          type="button"
          className="button button-primary"
          disabled={disabled}
          onClick={onJoin}
        >
          Join
        </button>
      )}
    </>
  )
}
