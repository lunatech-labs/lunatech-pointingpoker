import { useEffect, useState } from 'react'
import * as api from '../protocol/api'
import type { Role } from '../protocol/snapshot'
import type { Connection } from '../room/connection'
import {
  chooseDefault,
  forgetRole,
  joinRole,
  keepDefault,
  rememberRole,
  storedDefault
} from '../room/joinRole'
import { ownRoleOf } from '../room/view'
import { Alerts } from './Alerts'
import { Lobby, type LobbyTab } from './Lobby'
import { Room } from './Room'
import { useRoom } from './useRoom'

// Read once at startup: the path alone decides the page, and every change of room is a page load.
const pathRoom = window.location.pathname.split('/')[1] ?? ''
// Set by the legacy-link redirect and the reload on a refusal; cleared so a copied link is clean.
const params = new URLSearchParams(window.location.search)
const movedOnLoad = params.get('moved') === '1'
const restartedOnLoad = params.get('restarted') === '1'
if (movedOnLoad || restartedOnLoad) history.replaceState(null, '', window.location.pathname)
// Decision 7: the lobby's shape and the auto-join follow the default role stored at load.
const defaultOnLoad = storedDefault(localStorage)
const joinError = 'Could not join the room. Please try again.'
// A room remembered from before the cutover is a UUID, which the server's page route redirects.
const rejoinLabel = (id: string, name: string) =>
  `Rejoin ${/^[a-z]+-[a-z]+-[a-z]+$/.test(id) ? id : 'your last room'}${name ? ` as ${name}` : ''}`
const goTo = (id: string) => window.location.assign('/' + encodeURIComponent(id))

export function App({ connection }: { connection: Connection }) {
  const room = useRoom(connection)
  const [roomId, setRoomId] = useState(pathRoom)
  const [name, setName] = useState(localStorage.getItem('name') ?? '')
  const [choosingRole, setChoosingRole] = useState(defaultOnLoad === null)
  const [shownRole, setShownRole] = useState<Role>(defaultOnLoad ?? 'Voter')
  const [tab, setTab] = useState<LobbyTab>(pathRoom ? 'join' : 'create')
  const [error, setError] = useState('')
  const [moved, setMoved] = useState(movedOnLoad)
  const [restarted, setRestarted] = useState(restartedOnLoad)
  const [copied, setCopied] = useState(false)
  const remembered = localStorage.getItem('roomId')
  const reached = room.snapshot !== null

  // In place, so a ?moved=1 banner survives joining.
  const joinHere = () => {
    localStorage.setItem('name', name)
    const role = joinRole(localStorage, pathRoom, keepDefault(localStorage, shownRole))
    void connection.join(pathRoom, name, role).then(result => {
      if (result === 'failed') setError(joinError)
      else if (result === 'joined') setError('')
    })
  }

  const doCreate = () => {
    localStorage.setItem('name', name)
    keepDefault(localStorage, shownRole)
    api
      .createRoom()
      .then(id => {
        forgetRole(localStorage, id)
        goTo(id)
      })
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
    keepDefault(localStorage, shownRole)
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

  const chooseRole = (role: Role) => {
    chooseDefault(localStorage, role)
    setShownRole(role)
  }

  // Read again, since another tab may have stored a choice after this page loaded.
  const changeRole = () => {
    setShownRole(storedDefault(localStorage) ?? shownRole)
    setChoosingRole(true)
  }

  // Remembered only once reached, so an unreachable typed name is never offered back.
  useEffect(() => {
    if (reached) localStorage.setItem('roomId', pathRoom)
  }, [reached])

  // Each snapshot's own seat, so a switch made in another tab is stored by every tab.
  useEffect(() => {
    const role = room.snapshot && ownRoleOf(room.snapshot)
    if (role) rememberRole(localStorage, pathRoom, role)
  }, [room.snapshot])

  // A room's own path joins at once with a remembered name and a default role (decision 7).
  useEffect(() => {
    if (pathRoom && name && defaultOnLoad !== null) joinHere()
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
        restarted={restarted}
        onDismissRestarted={() => setRestarted(false)}
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
          defaultRole={shownRole}
          choosingRole={choosingRole}
          onChooseRole={chooseRole}
          onChangeRole={changeRole}
          rejoin={rejoin}
          disabled={room.fatal}
          onCreate={doCreate}
          onJoin={pathRoom ? joinHere : doJoin}
        />
      ) : (
        <Room
          roomId={pathRoom}
          snapshot={room.snapshot}
          onCopied={onCopied}
          onLeave={doLeave}
          onRefused={() => connection.refused()}
          onSwitched={role => rememberRole(localStorage, pathRoom, role)}
        />
      )}
    </>
  )
}
