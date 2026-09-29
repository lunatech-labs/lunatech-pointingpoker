import createClient from 'openapi-fetch'
import type { paths } from './generated/openapi'

const client = createClient<paths>()

// A join's 404 resolves; every other failure rejects, so a component's catch is where it lands.
export type JoinOutcome = 'joined' | 'not-a-room'

// Carries the status so a caller can single out a 401, the signal connection.refused() acts on.
export class ApiError extends Error {
  constructor(
    what: string,
    readonly status: number
  ) {
    super(`${what} answered ${status}`)
    this.name = 'ApiError'
  }
}

const refused = (what: string, response: Response) => new ApiError(what, response.status)

export async function createRoom(): Promise<string> {
  const { data, response } = await client.POST('/create-room', { parseAs: 'text' })
  if (data === undefined) throw refused('create-room', response)
  return data
}

export async function join(roomId: string, name: string): Promise<JoinOutcome> {
  const { response } = await client.POST('/rooms/{roomId}/join', {
    params: { path: { roomId } },
    body: { name }
  })
  // The page route has already judged the path, so a 404 here is a room refused after load.
  if (response.status === 404) return 'not-a-room'
  if (!response.ok) throw refused('join', response)
  return 'joined'
}

export type Command = 'show' | 'clear' | 'revote'

export async function command(roomId: string, name: Command): Promise<void> {
  const path = `/rooms/{roomId}/${name}` as const
  const { response } = await client.POST(path, { params: { path: { roomId } } })
  if (!response.ok) throw refused(name, response)
}

export async function vote(roomId: string, estimation: string): Promise<void> {
  const { response } = await client.POST('/rooms/{roomId}/vote', {
    params: { path: { roomId } },
    body: { estimation }
  })
  if (!response.ok) throw refused('vote', response)
}

export async function editIssue(roomId: string, issue: string): Promise<void> {
  const { response } = await client.POST('/rooms/{roomId}/edit-issue', {
    params: { path: { roomId } },
    body: { issue }
  })
  if (!response.ok) throw refused('edit-issue', response)
}
