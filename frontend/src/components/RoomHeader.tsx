import './room-header.css'
import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Link, LogOut, Menu } from 'lucide-react'
import type { Role } from '../protocol/snapshot'
import { useRoleSwitch } from './useRoleSwitch'

type Props = {
  roomId: string
  role: Role | null
  copied: boolean
  onCopy: () => void
  onLeave: () => void
  onSwitch: (role: Role) => void
}

export function RoomHeader({ roomId, role, copied, onCopy, onLeave, onSwitch }: Props) {
  const [menuShown, setMenuShown] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  // Called whatever the role, as a hook must be; nothing it returns is drawn without one.
  const { sentence, label, press } = useRoleSwitch(role ?? 'Voter', onSwitch)
  const copy = (event: MouseEvent) => {
    event.preventDefault()
    const el = document.createElement('textarea')
    el.value = window.location.origin + '/' + roomId
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
    onCopy()
  }
  const leave = (event: MouseEvent) => {
    event.preventDefault()
    onLeave()
  }
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !menuShown) return
    menuButton.current?.focus()
    setMenuShown(false)
  }
  return (
    <header className={copied ? 'room-header room-header-copied' : 'room-header'}>
      <span className="brand-logo" aria-hidden="true">
        <svg viewBox="30 31 51.2 39">
          <path
            fill="currentColor"
            fillRule="evenodd"
            d="M34 31 H76 a5.2 5.2 0 0 1 0 10.4 H67 V66 a4 4 0 0 1 -4 4 H34 a4 4 0 0 1 -4 -4 V35 a4 4 0 0 1 4 -4 Z M40 41.4 H57 V59.6 H40 Z"
          />
        </svg>
      </span>
      <span className="brand-logo-name">Pointing Poker</span>
      <span className="room-header-chip">
        <h1 className="room-header-id">{roomId}</h1>
        <a className="room-header-copy" href="#" aria-label="Copy link" onClick={copy}>
          <Link />
          <span className="room-header-copy-word">Copy link</span>
        </a>
      </span>
      <span className="room-header-copy-note" role="status">
        {copied ? 'Link copied' : ''}
      </span>
      {role && (
        <span className="room-header-role">
          {sentence}{' '}
          <button type="button" {...press}>
            {label}
          </button>
        </span>
      )}
      <a className="room-header-leave" href="#" onClick={leave}>
        <LogOut />
        Leave
      </a>
      <button
        ref={menuButton}
        className="room-header-menu-button button-quiet"
        type="button"
        aria-expanded={menuShown}
        aria-label="Menu"
        onClick={() => setMenuShown(shown => !shown)}
        onKeyDown={closeOnEscape}
      >
        <Menu />
      </button>
      {menuShown && (
        <div className="room-header-menu panel" onKeyDown={closeOnEscape}>
          {role && (
            <>
              <span className="room-header-menu-role">{sentence}</span>
              <button className="button-quiet" type="button" {...press}>
                {label}
              </button>
            </>
          )}
          <a className="button-quiet" href="#" onClick={leave}>
            <LogOut />
            Leave
          </a>
        </div>
      )}
    </header>
  )
}
