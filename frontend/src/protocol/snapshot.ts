import { z } from 'zod'

type ObjectOf = typeof z.object

// One definition for both strictness rules: zod's is per object, so two copies could drift.
function build(object: ObjectOf) {
  const participant = object({
    id: z.string(),
    name: z.string(),
    voted: z.boolean(),
    hasEstimation: z.boolean(),
    estimation: z.string()
  })
  return object({
    you: z.string(),
    currentIssue: z.string(),
    votesRevealed: z.boolean(),
    users: z.array(participant)
  })
}

// Lenient for the page: an unknown field is dropped, since refusing it could only break the room.
export const snapshotSchema = build(z.object)
// Typed as z.object: only the unknown-key rule differs, and nothing infers from this one.
export const strictSnapshotSchema = build(z.strictObject as ObjectOf)

export type RoomSnapshot = z.infer<typeof snapshotSchema>
export type Participant = RoomSnapshot['users'][number]
