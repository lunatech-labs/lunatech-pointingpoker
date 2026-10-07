import { z } from 'zod'

type ObjectOf = typeof z.object

// One definition for both strictness rules: zod's is per object, so two copies could drift.
function build(object: ObjectOf) {
  // The five legal states; value only where the reader may see it.
  const estimation = z.discriminatedUnion('type', [
    object({ type: z.literal('NoEstimation') }),
    object({ type: z.literal('ConfirmedHidden') }),
    object({ type: z.literal('UnconfirmedHidden') }),
    object({ type: z.literal('Confirmed'), value: z.string() }),
    object({ type: z.literal('Unconfirmed'), value: z.string() })
  ])
  // A facilitator's seat has no estimation, so it cannot carry one.
  const seat = z.discriminatedUnion('type', [
    object({ type: z.literal('Voter'), estimation }),
    object({ type: z.literal('Facilitator') })
  ])
  const participant = object({ id: z.string(), name: z.string(), seat })
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
export type Seat = Participant['seat']
export type Estimation = Extract<Seat, { type: 'Voter' }>['estimation']
