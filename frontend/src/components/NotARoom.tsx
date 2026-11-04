import { LobbyPage } from './LobbyPage'
import { RoomRow } from './RoomRow'

type Props = { typed: string; suggestion?: string; name: string }

// The not-a-room page (4d decision 4), fixed at load, so it holds no state.
export function NotARoom({ typed, suggestion, name }: Props) {
  return (
    <LobbyPage ended={false} banners={null}>
      <h1 className="lobby-page-title">
        <code>
          <bdi>{typed}</bdi>
        </code>{' '}
        is not a valid room name.
      </h1>
      {suggestion && (
        <>
          <p className="lobby-page-lead">Did you mean</p>
          <RoomRow
            id={suggestion}
            href={`/${suggestion}`}
            line2={name ? `Join as ${name}` : 'Join'}
            primary
          />
        </>
      )}
      <a
        className={`button ${suggestion ? 'button-outline' : 'button-primary'}`}
        href="/?tab=join"
      >
        Join a different room
      </a>
    </LobbyPage>
  )
}
