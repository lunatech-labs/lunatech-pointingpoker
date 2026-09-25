import axios from 'axios'

// Every call rejects on a failure, so a component's catch is the one place a failure lands.
export type JoinOutcome = 'joined' | 'not-a-room'

export async function createRoom(): Promise<string> {
  const response = await axios.post<string>('/create-room', {})
  return response.data
}

export async function join(roomId: string, name: string): Promise<JoinOutcome> {
  try {
    await axios.post(`/rooms/${roomId}/join`, { name })
    return 'joined'
  } catch (error) {
    // Only a typed or remembered name reaches /join unchecked; the page route answers it.
    if (axios.isAxiosError(error) && error.response?.status === 404) return 'not-a-room'
    throw error
  }
}

export type Command = 'show' | 'clear' | 'revote'

export async function command(roomId: string, name: Command): Promise<void> {
  await axios.post(`/rooms/${roomId}/${name}`, {})
}

export async function vote(roomId: string, estimation: string): Promise<void> {
  await axios.post(`/rooms/${roomId}/vote`, { estimation })
}

export async function editIssue(roomId: string, issue: string): Promise<void> {
  await axios.post(`/rooms/${roomId}/edit-issue`, { issue })
}
