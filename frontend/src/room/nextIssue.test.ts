import { describe, expect, it } from 'vitest'
import { movedOnText } from './nextIssue'

describe('movedOnText', () => {
  it('names the issue the room moved on to', () => {
    expect(movedOnText('PP-2')).toBe('The room moved on to: "PP-2"')
  })

  it('says so when the room moved on with no issue', () => {
    expect(movedOnText('')).toBe('The room moved on, with no issue yet')
  })
})
