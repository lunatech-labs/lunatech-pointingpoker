import { describe, expect, it } from 'vitest'
import { resultColumns } from './result'

describe('resultColumns', () => {
  it("keeps the deck's order, a value nobody voted for at 0", () => {
    expect(resultColumns(['1', '2', '3'], [['3', 2], ['1', 1]])).toEqual([
      ['1', 1],
      ['2', 0],
      ['3', 2]
    ])
  })

  it("puts a value outside the deck after it, in the summary's order", () => {
    expect(resultColumns(['1', '2'], [['7', 2], ['2', 1], ['x', 1]])).toEqual([
      ['1', 0],
      ['2', 1],
      ['7', 2],
      ['x', 1]
    ])
  })

  it('draws an empty deck for nobody voted', () => {
    expect(resultColumns(['1'], [])).toEqual([['1', 0]])
  })
})
