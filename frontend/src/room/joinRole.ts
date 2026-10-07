import type { Role } from '../protocol/snapshot'

// The slice of localStorage this module uses, so a test can hand it a Map.
export type RoleStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

// Keyed by Role, so a role added to the schema fails the build here until it is decoded.
const known: Record<Role, true> = { Voter: true, Facilitator: true }
// Every role, in the order the lobby offers them.
export const roles = Object.keys(known) as Role[]
const DEFAULT_KEY = 'defaultRole'
const roomKey = (roomId: string) => `role:${roomId}`

// Any other stored string counts as none, so a bad value is skipped rather than sent and refused.
const decode = (stored: string | null): Role | null =>
  stored !== null && Object.hasOwn(known, stored) ? (stored as Role) : null

export const storedDefault = (storage: RoleStorage): Role | null =>
  decode(storage.getItem(DEFAULT_KEY))

// A choice in the "Your default role" fieldset, stored at once.
export const chooseDefault = (storage: RoleStorage, role: Role) =>
  storage.setItem(DEFAULT_KEY, role)

// A lobby submit stores the shown role only when none is stored, and returns the stored one.
export function keepDefault(storage: RoleStorage, shown: Role): Role {
  const stored = storedDefault(storage)
  if (stored !== null) return stored
  chooseDefault(storage, shown)
  return shown
}

// The room's remembered role, else the default role (the roles spec's Terms).
export const joinRole = (storage: RoleStorage, roomId: string, defaultRole: Role): Role =>
  decode(storage.getItem(roomKey(roomId))) ?? defaultRole

// Written from the page's own seat in each snapshot, and by a 204 from /role.
export const rememberRole = (storage: RoleStorage, roomId: string, role: Role) =>
  storage.setItem(roomKey(roomId), role)

// Create's only: a reused slug must not inherit the role of the room it named before.
export const forgetRole = (storage: RoleStorage, roomId: string) =>
  storage.removeItem(roomKey(roomId))
