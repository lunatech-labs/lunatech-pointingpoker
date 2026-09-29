import 'bootstrap/dist/css/bootstrap.min.css'
import './styles.css'
import { createRoot } from 'react-dom/client'
import { App } from './components/App'
import { createConnection } from './room/connection'
import { mintConnectionId } from './room/connectionId'

// One per page instance, never persisted: a reload must mint a new one, or its own late
// beacon would name the id the replacement page is now using.
const connection = createConnection({
  connectionId: mintConnectionId(),
  openStream: url => new EventSource(url),
  sendBeacon: url => void navigator.sendBeacon(url),
  events: window,
  location: window.location
})

// No StrictMode: its double effect would join twice, and 8a's close-before-open is not here yet.
createRoot(document.getElementById('app')!).render(<App connection={connection} />)
