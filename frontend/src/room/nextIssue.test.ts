import { describe, expect, it } from 'vitest'
import { closed, preselected, sameChoice, shows, step, type Choice, type NextState } from './nextIssue'

const five: Choice = { type: 'Estimate', value: '5' }
const parked: Choice = { type: 'Parked' }
const open: NextState = {
  mode: 'open',
  opening: 3,
  draft: 'PP-1',
  choice: five,
  failed: false,
  missing: false
}
const sending: NextState = {
  mode: 'sending',
  opening: 3,
  draft: 'PP-1',
  choice: five,
  awaiting: 7,
  legend: { issue: '', position: 3 }
}
const pressed = { type: 'pressed', issue: 'PP-1', round: 3, checked: five } as const

describe('step', () => {
  it('opens from closed with the one-lined issue, the round, the checked choice and no message', () => {
    expect(step(closed, { type: 'pressed', issue: 'a\nb', round: 3, checked: five })).toEqual({
      mode: 'open',
      opening: 3,
      draft: 'a b',
      choice: five,
      failed: false,
      missing: false
    })
  })

  it('opens afresh on a press while open or sending, as from closed', () => {
    const later = { type: 'pressed', issue: 'PP-9\nx', round: 4, checked: null } as const
    const fresh = { mode: 'open', opening: 4, draft: 'PP-9 x', choice: null, failed: false, missing: false }
    for (const s of [{ ...open, draft: 'mine', failed: true, missing: true }, sending])
      expect(step(s, later)).toEqual(fresh)
  })

  it('opens from every state with the checked choice', () => {
    for (const s of [closed, open, sending])
      for (const checked of [five, parked, null])
        expect(step(s, { ...pressed, checked })).toMatchObject({ mode: 'open', choice: checked, missing: false })
  })

  it('sets the chosen choice in open, clearing the missing-choice message, and ignores it elsewhere', () => {
    expect(step({ ...open, choice: null, missing: true }, { type: 'chose', choice: parked })).toEqual({
      ...open,
      choice: parked,
      missing: false
    })
    expect(step(sending, { type: 'chose', choice: parked })).toBe(sending)
    expect(step(closed, { type: 'chose', choice: parked })).toBe(closed)
  })

  it('asks for a choice on submit with none, sending nothing', () => {
    expect(step({ ...open, choice: null }, { type: 'submit', request: 8, legend: { issue: '', position: 3 } })).toEqual({
      ...open,
      choice: null,
      missing: true
    })
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

  it('sends from open with the choice, awaiting the request and clearing both messages', () => {
    expect(step({ ...open, choice: parked, failed: true, missing: true }, { type: 'submit', request: 8, legend: { issue: '', position: 3 } })).toEqual({
      mode: 'sending',
      opening: 3,
      draft: 'PP-1',
      choice: parked,
      awaiting: 8,
      legend: { issue: '', position: 3 }
    })
    expect(step(sending, { type: 'submit', request: 8, legend: { issue: '', position: 3 } })).toBe(sending)
    expect(step(closed, { type: 'submit', request: 8, legend: { issue: '', position: 3 } })).toBe(closed)
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

  it('reopens with the message, the draft and the choice kept on a failed awaited answer', () => {
    expect(step({ ...sending, choice: parked }, { type: 'answered', request: 7, ok: false })).toEqual({
      mode: 'open',
      opening: 3,
      draft: 'PP-1',
      choice: parked,
      failed: true,
      missing: false
    })
  })

  it('ignores an answer to another request in every state', () => {
    for (const s of [closed, open, sending])
      for (const ok of [true, false]) expect(step(s, { type: 'answered', request: 6, ok })).toBe(s)
  })

  it('ignores an earlier request answer after closing and reopening', () => {
    let s = step(closed, pressed)
    s = step(s, { type: 'submit', request: 1, legend: { issue: 'PP-1', position: 1 } })
    s = step(s, { type: 'closed' })
    s = step(s, pressed)
    const answered = step(s, { type: 'answered', request: 1, ok: false })
    expect(answered).toBe(s)
    expect(answered.mode).toBe('open')
  })

  it('reopens without the message and with the new issue after a failure and a close', () => {
    let s = step(sending, { type: 'answered', request: 7, ok: false })
    s = step(s, { type: 'closed' })
    expect(step(s, { type: 'pressed', issue: 'PP-9', round: 4, checked: null })).toEqual({
      mode: 'open',
      opening: 4,
      draft: 'PP-9',
      choice: null,
      failed: false,
      missing: false
    })
  })
})

describe('shows', () => {
  it('shows the notice, not the message, once the room moved on while open', () => {
    expect(shows({ ...open, failed: true }, 4)).toEqual({
      mode: 'open',
      draft: 'PP-1',
      choice: five,
      failed: false,
      missing: false,
      movedOn: true,
      legend: null
    })
  })

  it('keeps the submitted legend while sending, in its round and the next', () => {
    expect(shows(sending, 3).legend).toEqual({ issue: '', position: 3 })
    expect(shows(sending, 4).legend).toEqual({ issue: '', position: 3 })
  })

  it('shows no legend when open or closed, nor after a failed answer', () => {
    expect(shows(open, 3).legend).toBeNull()
    expect(shows(closed, 3).legend).toBeNull()
    expect(shows(step(sending, { type: 'answered', request: 7, ok: false }), 4).legend).toBeNull()
  })

  it('shows the notice, not the missing-choice message, once the room moved on while open', () => {
    expect(shows({ ...open, choice: null, missing: true }, 4)).toMatchObject({ missing: false, movedOn: true })
  })

  it('shows the missing-choice message while open in the opening round', () => {
    expect(shows({ ...open, choice: null, missing: true }, 3)).toMatchObject({ missing: true, movedOn: false })
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
      choice: five,
      legend: { issue: '', position: 3 },
      missing: false,
      movedOn: false
    })
  })

  it('shows nothing when closed', () => {
    expect(shows(closed, 9)).toEqual({
      mode: 'closed',
      draft: '',
      choice: null,
      failed: false,
      missing: false,
      movedOn: false,
      legend: null
    })
  })
})

describe('sameChoice', () => {
  it('matches a choice by its type, and an estimate by its value too', () => {
    expect(sameChoice(five, { type: 'Estimate', value: '5' })).toBe(true)
    expect(sameChoice(five, { type: 'Estimate', value: '8' })).toBe(false)
    expect(sameChoice(parked, { type: 'Parked' })).toBe(true)
    expect(sameChoice(parked, { type: 'Skip' })).toBe(false)
    expect(sameChoice(null, five)).toBe(false)
  })
})

describe('preselected', () => {
  const deck = ['1', '2', '?']

  it.each(deck)('chooses %s when it alone is on top, revealed', (v) => {
    const other = deck.find((d) => d !== v)!
    expect(
      preselected(deck, true, [
        [v, 2],
        [other, 1]
      ])
    ).toEqual({ type: 'Estimate', value: v })
  })

  it.each([
    [
      'a tie',
      true,
      [
        ['2', 1],
        ['3', 1]
      ]
    ],
    [
      'a top value off the deck',
      true,
      [
        ['7', 2],
        ['1', 1]
      ]
    ],
    ['nobody voted', true, []],
    ['a single value while voting', false, [['1', 2]]]
  ] as [string, boolean, [string, number][]][])('is null for %s', (_c, revealed, summary) => {
    expect(preselected(deck, revealed, summary)).toBeNull()
  })
})
