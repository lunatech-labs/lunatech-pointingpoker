import { describe, expect, it } from 'vitest'
import { closed, movedOnText, shows, step, type NextState } from './nextIssue'

describe('movedOnText', () => {
  it('names the issue the room moved on to', () => {
    expect(movedOnText('PP-2')).toBe('The room moved on to: "PP-2"')
  })

  it('says so when the room moved on with no issue', () => {
    expect(movedOnText('')).toBe('The room moved on, with no issue yet')
  })
})

const open: NextState = {
  mode: 'open',
  opening: 3,
  draft: 'PP-1',
  failed: false
}
const sending: NextState = {
  mode: 'sending',
  opening: 3,
  draft: 'PP-1',
  awaiting: 7
}
const pressed = { type: 'pressed', issue: 'PP-1', round: 3 } as const

describe('step', () => {
  it('opens from closed with the one-lined issue, the round and no message', () => {
    expect(step(closed, { type: 'pressed', issue: 'a\nb', round: 3 })).toEqual({
      mode: 'open',
      opening: 3,
      draft: 'a b',
      failed: false
    })
  })

  it('opens afresh on a press while open or sending, as from closed', () => {
    const later = { type: 'pressed', issue: 'PP-9\nx', round: 4 } as const
    const fresh = { mode: 'open', opening: 4, draft: 'PP-9 x', failed: false }
    for (const s of [{ ...open, draft: 'mine', failed: true }, sending]) expect(step(s, later)).toEqual(fresh)
  })

  it('ignores the awaited answer once a press opened afresh from sending', () => {
    const s = step(sending, pressed)
    expect(step(s, { type: 'answered', request: 7, ok: true })).toBe(s)
  })

  it('one-lines typed text in open and ignores it elsewhere', () => {
    expect(step(open, { type: 'typed', text: 'x\ny' })).toEqual({
      ...open,
      draft: 'x y'
    })
    expect(step(sending, { type: 'typed', text: 'x' })).toBe(sending)
    expect(step(closed, { type: 'typed', text: 'x' })).toBe(closed)
  })

  it('sends from open, awaiting the request and clearing the message', () => {
    expect(step({ ...open, failed: true }, { type: 'submit', request: 8 })).toEqual({
      mode: 'sending',
      opening: 3,
      draft: 'PP-1',
      awaiting: 8
    })
    expect(step(sending, { type: 'submit', request: 8 })).toBe(sending)
    expect(step(closed, { type: 'submit', request: 8 })).toBe(closed)
  })

  it('closes on cancel from open and ignores it elsewhere', () => {
    expect(step(open, { type: 'cancel' })).toBe(closed)
    expect(step(sending, { type: 'cancel' })).toBe(sending)
    expect(step(closed, { type: 'cancel' })).toBe(closed)
  })

  it('closes on the close event from open and sending', () => {
    expect(step(open, { type: 'closed' })).toBe(closed)
    expect(step(sending, { type: 'closed' })).toBe(closed)
    expect(step(closed, { type: 'closed' })).toBe(closed)
  })

  it('closes on the awaited 204', () => {
    expect(step(sending, { type: 'answered', request: 7, ok: true })).toBe(closed)
  })

  it('reopens with the message and the draft kept on a failed awaited answer', () => {
    expect(step(sending, { type: 'answered', request: 7, ok: false })).toEqual({
      mode: 'open',
      opening: 3,
      draft: 'PP-1',
      failed: true
    })
  })

  it('ignores an answer to another request in every state', () => {
    for (const s of [closed, open, sending])
      for (const ok of [true, false]) expect(step(s, { type: 'answered', request: 6, ok })).toBe(s)
  })

  it('ignores an earlier request answer after closing and reopening', () => {
    let s = step(closed, pressed)
    s = step(s, { type: 'submit', request: 1 })
    s = step(s, { type: 'closed' })
    s = step(s, pressed)
    const answered = step(s, { type: 'answered', request: 1, ok: false })
    expect(answered).toBe(s)
    expect(answered.mode).toBe('open')
  })

  it('reopens without the message and with the new issue after a failure and a close', () => {
    let s = step(sending, { type: 'answered', request: 7, ok: false })
    s = step(s, { type: 'closed' })
    expect(step(s, { type: 'pressed', issue: 'PP-9', round: 4 })).toEqual({
      mode: 'open',
      opening: 4,
      draft: 'PP-9',
      failed: false
    })
  })
})

describe('shows', () => {
  it('shows the notice, not the message, once the room moved on while open', () => {
    expect(shows({ ...open, failed: true }, 4)).toEqual({
      mode: 'open',
      draft: 'PP-1',
      failed: false,
      movedOn: true
    })
  })

  it('shows the message while open in the opening round', () => {
    expect(shows({ ...open, failed: true }, 3)).toMatchObject({
      failed: true,
      movedOn: false
    })
  })

  it('never shows moved on while sending', () => {
    expect(shows(sending, 4)).toMatchObject({
      mode: 'sending',
      movedOn: false
    })
  })

  it('shows nothing when closed', () => {
    expect(shows(closed, 9)).toEqual({
      mode: 'closed',
      draft: '',
      failed: false,
      movedOn: false
    })
  })
})
