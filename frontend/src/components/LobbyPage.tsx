import './lobby-page.css'
import type { ReactNode } from 'react'
import { BrandLogo } from './BrandLogo'

type Props = {
  // A session that has ended: the panel takes the inert look (3b4 decision 11).
  ended: boolean
  banners: ReactNode
  children: ReactNode
}

// 3b4 decisions 2 and 3: the header bar, then one centred column for the banners and the panel.
export function LobbyPage({ ended, banners, children }: Props) {
  return (
    <>
      <header className="lobby-page-header">
        <div className="lobby-page-column">
          <BrandLogo />
        </div>
      </header>
      <main className="lobby-page-main">
        <div className="lobby-page-column">
          {banners}
          <div className={`panel lobby-page-panel${ended ? ' lobby-page-inert' : ''}`}>
            {children}
          </div>
        </div>
      </main>
    </>
  )
}
