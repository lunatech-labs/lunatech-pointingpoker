import './lobby-tabs.css'
import type { MouseEvent } from 'react'

export type LobbyTab = 'create' | 'join'

type Props = {
  tab: LobbyTab
  onTab: (tab: LobbyTab) => void
}

// 3b4 decision 6: the tabs are links; only the active one carries aria-current.
export function LobbyTabs({ tab, onTab }: Props) {
  const link = (which: LobbyTab, text: string) => (
    <a
      href="#"
      aria-current={tab === which ? 'true' : undefined}
      onClick={(event: MouseEvent) => {
        event.preventDefault()
        onTab(which)
      }}
    >
      {text}
    </a>
  )
  return (
    <nav className="lobby-tabs" aria-label="Create or join">
      {link('create', 'Create')}
      {link('join', 'Join')}
    </nav>
  )
}
