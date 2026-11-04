import './fonts.css'
import './base.css'
import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import { App } from './components/App'
import { NotARoom } from './components/NotARoom'
import * as api from './protocol/api'
import { createConnection } from './room/connection'
import { mintConnectionId } from './room/connectionId'

const root = createRoot(document.getElementById('root')!)
const handOver = document.querySelector<HTMLMetaElement>('meta[name="not-a-room"]')

if (handOver) {
  // No connection and no App, which would join the typed path on mount (4d decision 1).
  document.title = 'Not a room name'
  root.render(
    <StrictMode>
      <NotARoom
        typed={handOver.content}
        suggestion={handOver.dataset.suggestion}
        name={localStorage.getItem('name') ?? ''}
      />
    </StrictMode>
  )
} else {
  // One per page instance, never persisted: a reload must mint a new one, or its own late
  // beacon would name the id the replacement page is now using.
  const connection = createConnection({
    connectionId: mintConnectionId(),
    join: api.join,
    openStream: url => new EventSource(url),
    sendBeacon: url => void navigator.sendBeacon(url),
    fetchPage: (url, init) => fetch(url, init),
    events: window,
    location: window.location
  })

  // StrictMode's double effect is safe: the connection lets only the first join and open through.
  root.render(
    <StrictMode>
      <App connection={connection} />
    </StrictMode>
  )
}
