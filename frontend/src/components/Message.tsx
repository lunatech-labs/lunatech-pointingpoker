import './message.css'
import type { ReactNode } from 'react'
import { Info, TriangleAlert, X } from 'lucide-react'

type Props = {
  tone: 'problem' | 'notice'
  role?: 'alert' | 'status'
  onDismiss?: () => void
  children: ReactNode
}

// 3b3's message panel: a problem or a notice, an icon then the words, and a Dismiss if given.
export function Message({ tone, role, onDismiss, children }: Props) {
  return (
    <div className={`message message-${tone}`} role={role}>
      {tone === 'problem' ? <TriangleAlert /> : <Info />}
      <p>{children}</p>
      {onDismiss && (
        <button className="button-quiet" type="button" aria-label="Dismiss" onClick={onDismiss}>
          <X />
        </button>
      )}
    </div>
  )
}
