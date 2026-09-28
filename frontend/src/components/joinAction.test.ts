import { describe, expect, it } from 'vitest'
import { joinAction } from './joinAction'

describe('joinAction', () => {
  it('enters the room on a successful join', () => {
    expect(joinAction('joined', 'my-room', '')).toEqual({ kind: 'enter' })
  })

  it('retargets to a room typed in the join form, different from the current path', () => {
    expect(joinAction('not-a-room', 'other-room', 'my-room')).toEqual({
      kind: 'retarget',
      path: '/other-room'
    })
  })

  it('shows an error instead of looping when already on the failed room\'s own path', () => {
    expect(joinAction('not-a-room', 'my-room', 'my-room')).toEqual({
      kind: 'show-error',
      message: 'Could not join the room. Please try again.'
    })
  })
})
