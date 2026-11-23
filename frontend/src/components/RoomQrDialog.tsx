import './room-qr-dialog.css'
import { useId, type RefObject } from 'react'
import { correction, generate } from 'lean-qr'
import { toSvgPath } from 'lean-qr/extras/svg'
import { pressRules } from './pressRules'

type Props = { roomId: string; link: string; dialogRef: RefObject<HTMLDialogElement | null> }

// The room link as a scannable code (QR code dialog spec, decisions 2 and 3); RoomHeader opens it.
export function RoomQrDialog({ roomId, link, dialogRef }: Props) {
  const title = useId()
  const code = generate(link, { minCorrectionLevel: correction.M })
  const box = code.size + 8
  return (
    <dialog
      ref={dialogRef}
      className="panel qr-dialog"
      closedby="any"
      aria-labelledby={title}
      {...pressRules}
    >
      <h2 id={title}>Scan to join</h2>
      <svg className="qr-code" viewBox={`-4 -4 ${box} ${box}`} role="img" aria-label="QR code of the room link">
        <rect x="-4" y="-4" width={box} height={box} fill="#fff" />
        <path fill="#000" d={toSvgPath(code)} />
      </svg>
      <p className="qr-room">{roomId}</p>
      <p className="qr-link">{link}</p>
      <button className="button button-secondary" type="button" onClick={() => dialogRef.current?.close()}>
        Close
      </button>
    </dialog>
  )
}
