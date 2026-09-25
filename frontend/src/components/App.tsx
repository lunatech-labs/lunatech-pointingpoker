import { useEffect, useState } from 'react'
import * as api from '../protocol/api'
import type { Connection } from '../room/connection'
import { Alerts } from './Alerts'
import { Lobby, type LobbyTab } from './Lobby'
import { Room } from './Room'
import { useRoom } from './useRoom'

// Read once at startup: the path wins over the remembered room, and the name persists.
const pathRoom = window.location.pathname.split('/')[1] ?? ''
// Set by the legacy-link redirect; cleared from the address so a copied link is clean.
const movedOnLoad = new URLSearchParams(window.location.search).get('moved') === '1'
if (movedOnLoad) history.replaceState(null, '', window.location.pathname)

export function App({ connection }: { connection: Connection }) {
  const room = useRoom(connection)
  const [roomId, setRoomId] = useState(pathRoom || localStorage.getItem('roomId') || '')
  const [name, setName] = useState(localStorage.getItem('name') ?? '')
  const [tab, setTab] = useState<LobbyTab>(pathRoom ? 'join' : 'create')
  const [error, setError] = useState('')
  const [moved, setMoved] = useState(movedOnLoad)
  const [copied, setCopied] = useState(false)

  const doJoin = (id: string) => {
    localStorage.setItem('roomId', id)
    localStorage.setItem('name', name)
    api
      .join(id, name)
      .then(outcome => {
        if (outcome === 'not-a-room') {
          localStorage.removeItem('roomId')
          window.location.assign('/' + encodeURIComponent(id))
          return
        }
        setError('')
        connection.open(id)
      })
      .catch(reason => {
        setError('Could not join the room. Please try again.')
        console.error('Failed to join room:', reason)
      })
  }

  const doCreate = () => {
    api
      .createRoom()
      .then(created => {
        setRoomId(created)
        doJoin(created)
      })
      .catch(reason => {
        console.log(reason)
        setError('Could not create a room. Please try again.')
      })
  }

  // Today's doCopy: one bare timeout, so a second copy does not extend the hint.
  const onCopied = () => {
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const doLeave = () => {
    connection.leave()
    localStorage.clear()
  }

  // Today's startup rejoin: a room and a name, from the path or from before, join at once.
  useEffect(() => {
    if (roomId && name) doJoin(roomId)
    // Once, on mount, as the Vue page's created() ran once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const connectionMessage = room.fatal
    ? 'Your session has ended. Please reload the page to rejoin.'
    : room.lost
      ? 'Connection to the room was lost'
      : ''

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
          onRoomId={setRoomId}
          name={name}
          onName={setName}
          onCreate={doCreate}
          onJoin={() => {
            // v-model.trim's job: a pasted name with a trailing space is not refused.
            const id = roomId.trim()
            setRoomId(id)
            doJoin(id)
          }}
        />
      ) : (
        <Room roomId={roomId} snapshot={room.snapshot} onCopied={onCopied} onLeave={doLeave} />
      )}
    </>
  )
}
