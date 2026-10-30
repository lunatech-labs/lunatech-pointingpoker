import './room-row.css'
import { ArrowRight } from 'lucide-react'

type Props = {
  id: string
  line2?: string
  href?: string
}

// The room row (3b4 Terms): with an href, the link with its second line and arrow; else the badge.
export function RoomRow({ id, line2, href }: Props) {
  const square = <span className="room-row-square" aria-hidden="true" />
  if (!href) {
    return (
      <div className="room-row">
        {square}
        <span className="room-row-text">
          <span className="room-row-id">{id}</span>
        </span>
      </div>
    )
  }
  // The space keeps the link's name "<id> <line 2>", as the mockup writes it.
  return (
    <a className="room-row" href={href}>
      {square}
      <span className="room-row-text">
        <span className="room-row-id">{id}</span>{' '}
        <span className="room-row-line2">{line2}</span>
      </span>
      <span className="room-row-go" aria-hidden="true">
        <ArrowRight />
      </span>
    </a>
  )
}
