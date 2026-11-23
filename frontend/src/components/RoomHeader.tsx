import './room-header.css'
import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Link, LogOut, Menu, QrCode } from 'lucide-react'
import type { Role } from '../protocol/snapshot'
import { BrandLogo } from './BrandLogo'
import { RoomQrDialog } from './RoomQrDialog'
import { useRoleSwitch } from './useRoleSwitch'

type Props = {
  roomId: string
  role: Role | null
  copied: boolean
  onCopy: () => void
  onLeave: () => void
  onSwitch: (role: Role) => void
}

const roomLink = (roomId: string) => window.location.origin + '/' + roomId

export function RoomHeader({ roomId, role, copied, onCopy, onLeave, onSwitch }: Props) {
  const [menuShown, setMenuShown] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const qrDialog = useRef<HTMLDialogElement>(null)
  const link = roomLink(roomId)
  // Called whatever the role, as a hook must be; nothing it returns is drawn without one.
  const { sentence, label, press } = useRoleSwitch(role ?? 'Voter', onSwitch)
  const copy = () => {
    const el = document.createElement('textarea')
    el.value = link
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
      <BrandLogo />
      <span className="room-header-chip">
        <h1 className="room-header-id" tabIndex={-1} data-dismiss-focus>
          {roomId}
        </h1>
        <button className="room-header-copy" type="button" aria-label="Copy link" onClick={copy}>
          <Link />
          <span className="room-header-copy-word">Copy link</span>
        </button>
        <button
          className="room-header-copy"
          type="button"
          aria-label="QR code"
          onClick={() => {
            qrDialog.current?.showModal()
            // showModal() scrolls to Close, hiding a short viewport's code top
            if (qrDialog.current) qrDialog.current.scrollTop = 0
          }}
        >
          <QrCode />
          <span className="room-header-copy-word">QR code</span>
        </button>
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
      <RoomQrDialog roomId={roomId} link={link} dialogRef={qrDialog} />
    </header>
  )
}
