import { useSyncExternalStore } from 'react'
import type { Connection, RoomStore } from '../room/connection'

// The one way components read room state.
export function useRoom(connection: Connection): RoomStore {
  return useSyncExternalStore(connection.subscribe, connection.getSnapshot)
}
