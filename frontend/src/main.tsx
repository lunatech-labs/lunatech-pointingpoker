import 'bootstrap/dist/css/bootstrap.min.css'
import './styles.css'
import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import { App } from './components/App'
import * as api from './protocol/api'
import { createConnection } from './room/connection'
import { mintConnectionId } from './room/connectionId'

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
createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App connection={connection} />
  </StrictMode>
)
