import './message.css'
import type { ReactNode } from 'react'
import { Info, TriangleAlert } from 'lucide-react'

// 3b3's message panel: a problem or a notice, an icon then the words.
export function Message({ tone, children }: { tone: 'problem' | 'notice'; children: ReactNode }) {
  return (
    <div className={`message message-${tone}`}>
      {tone === 'problem' ? <TriangleAlert /> : <Info />}
      <p>{children}</p>
    </div>
  )
}
