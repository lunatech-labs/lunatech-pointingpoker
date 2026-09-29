import { useEffect, useState } from 'react'
import * as api from '../protocol/api'
import type { Connection } from '../room/connection'
import { Alerts } from './Alerts'
import { Lobby, type LobbyTab } from './Lobby'
import { Room } from './Room'
import { useRoom } from './useRoom'

// Read once at startup: the path alone decides the page, and every change of room is a page load.
const pathRoom = window.location.pathname.split('/')[1] ?? ''
// Set by the legacy-link redirect; cleared from the address so a copied link is clean.
const movedOnLoad = new URLSearchParams(window.location.search).get('moved') === '1'
if (movedOnLoad) history.replaceState(null, '', window.location.pathname)
const joinError = 'Could not join the room. Please try again.'
// A room remembered from before the cutover is a UUID, which the server's page route redirects.
const rejoinLabel = (id: string, name: string) =>
  `Rejoin ${/^[a-z]+-[a-z]+-[a-z]+$/.test(id) ? id : 'your last room'}${name ? ` as ${name}` : ''}`
const goTo = (id: string) => window.location.assign('/' + encodeURIComponent(id))

export function App({ connection }: { connection: Connection }) {
  const room = useRoom(connection)
  const [roomId, setRoomId] = useState(pathRoom)
  const [name, setName] = useState(localStorage.getItem('name') ?? '')
  const [tab, setTab] = useState<LobbyTab>(pathRoom ? 'join' : 'create')
  const [error, setError] = useState('')
  const [moved, setMoved] = useState(movedOnLoad)
  const [copied, setCopied] = useState(false)
  const remembered = localStorage.getItem('roomId')
  const reached = room.snapshot !== null

  // In place, so a ?moved=1 banner survives joining.
  const joinHere = () => {
    localStorage.setItem('name', name)
    api
      .join(pathRoom, name)
      .then(outcome => {
        if (outcome !== 'joined') return setError(joinError)
        setError('')
        connection.open(pathRoom)
      })
      .catch(reason => {
        setError(joinError)
        console.error('Failed to join room:', reason)
      })
  }

  const doCreate = () => {
    localStorage.setItem('name', name)
    api
      .createRoom()
      .then(goTo)
      .catch(reason => {
        console.log(reason)
        setError('Could not create a room. Please try again.')
      })
  }

  // As the Vue page's v-model.trim: a pasted name with a trailing space is not refused.
  const doJoin = () => {
    const id = roomId.trim()
    if (!id) return setError(joinError)
    localStorage.setItem('name', name)
    goTo(id)
  }

  // The Vue page's doCopy: one bare timeout, so a second copy does not extend the hint.
  const onCopied = () => {
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  // Forgets the room but keeps the name, which the lobby prefills.
  const doLeave = () => {
    localStorage.removeItem('roomId')
    connection.leave()
  }

  // Remembered only once reached, so an unreachable typed name is never offered back.
  useEffect(() => {
    if (reached) localStorage.setItem('roomId', pathRoom)
  }, [reached])

  // A room's own path with a remembered name joins at once.
  useEffect(() => {
    if (pathRoom && name) joinHere()
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const connectionMessage = room.fatal
    ? 'Your session has ended. Please reload the page to rejoin.'
    : room.lost
      ? 'Connection to the room was lost'
      : ''
  const rejoin =
    !pathRoom && remembered
      ? { href: '/' + encodeURIComponent(remembered), label: rejoinLabel(remembered, name) }
      : null

  return (
    <>
      <Alerts
        error={connectionMessage || error}
        copied={copied}
        moved={moved}
        onDismissMoved={() => setMoved(false)}
      />
      {room.snapshot === null ? (
        <Lobby
          tab={tab}
          onTab={setTab}
          roomId={roomId}
          fixedRoom={pathRoom !== ''}
          onRoomId={setRoomId}
          name={name}
          onName={setName}
          rejoin={rejoin}
          onCreate={doCreate}
          onJoin={pathRoom ? joinHere : doJoin}
        />
      ) : (
        <Room roomId={pathRoom} snapshot={room.snapshot} onCopied={onCopied} onLeave={doLeave} />
      )}
    </>
  )
}
