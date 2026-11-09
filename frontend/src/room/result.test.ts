import { describe, expect, it } from 'vitest'
import { resultColumns, resultExtremes, resultHeadline } from './result'

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

describe('resultHeadline', () => {
  const DECK = ['0', '0.5', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?']
  const most = (tied: string[], figure: string[], sub: string, spoken: string) => ({
    label: 'Most voted',
    tied,
    figure,
    sub,
    spoken
  })

  it('says nobody voted', () => {
    expect(resultHeadline(DECK, [])).toEqual({
      label: 'Nobody voted',
      tied: [],
      figure: [],
      sub: '',
      spoken: ''
    })
  })

  it('names one value with its share of the votes', () => {
    expect(resultHeadline(DECK, [['8', 4], ['5', 2], ['3', 1]])).toEqual(
      most(['8'], ['8'], '4 of 7 votes', '8')
    )
  })

  it('says vote in the singular for a single voter', () => {
    expect(resultHeadline(DECK, [['5', 1]])).toEqual(most(['5'], ['5'], '1 of 1 vote', '5'))
  })

  it('lists two voters who differ as a tie', () => {
    expect(resultHeadline(DECK, [['8', 1], ['5', 1]])).toEqual(
      most(['5', '8'], ['5', '8'], 'Tied, 1 vote each', '5 and 8')
    )
  })

  it('lists three tied with two votes each', () => {
    expect(resultHeadline(DECK, [['13', 2], ['3', 2], ['5', 2], ['8', 1]])).toEqual(
      most(['3', '5', '13'], ['3', '5', '13'], 'Tied, 2 votes each', '3, 5 and 13')
    )
  })

  it('shows four tied with two votes each as Tie', () => {
    expect(resultHeadline(DECK, [['1', 2], ['2', 2], ['3', 2], ['5', 2]])).toEqual(
      most(['1', '2', '3', '5'], ['Tie'], '4 values, 2 votes each', 'Tie')
    )
  })

  it('shows four voters who all differ as Tie', () => {
    expect(resultHeadline(DECK, [['1', 1], ['2', 1], ['3', 1], ['5', 1]])).toEqual(
      most(['1', '2', '3', '5'], ['Tie'], '4 values, 1 vote each', 'Tie')
    )
  })

  it('lists a tie in chart order whatever the summary order', () => {
    const values = ['0.5', '89', '?']
    const orders = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0]
    ]
    for (const order of orders) {
      const summary = order.map((i): [string, number] => [values[i], 1])
      expect(resultHeadline(DECK, summary).tied).toEqual(values)
    }
  })
})

describe('resultExtremes', () => {
  const DECK = ['0', '0.5', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?']

  const cases: [string, [string, number][], { low: string; high: string } | null][] = [
    ['marks 3 and 5, past ? and no vote', [['3', 1], ['5', 1], ['?', 1]], { low: '3', high: '5' }],
    ['marks a tied lowest once', [['5', 2], ['8', 1]], { low: '5', high: '8' }],
    [
      'counts a not-confirmed vote like any other',
      [['3', 1], ['5', 1], ['8', 1]],
      { low: '3', high: '8' }
    ],
    ['marks 0.5 and 89', [['0.5', 1], ['89', 1]], { low: '0.5', high: '89' }],
    ['marks nothing when everyone agrees', [['5', 2]], null],
    ['marks nothing beside ?', [['5', 1], ['?', 1]], null],
    ['ignores a value off the deck', [['3', 1], ['7', 1]], null],
    ['marks nothing for ? only', [['?', 2]], null],
    ['marks nothing when nobody voted', [], null]
  ]

  it.each(cases)('%s', (_name, summary, expected) => {
    expect(resultExtremes(DECK, summary)).toEqual(expected)
  })

  const orders = (items: string[]): string[][] =>
    items.length <= 1
      ? [items]
      : items.flatMap((item, i) =>
          orders([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest])
        )

  it('ranks by the deck whatever the summary order', () => {
    const all = orders(['0.5', '1', '89', '?'])
    expect(all).toHaveLength(24)
    for (const order of all) {
      const summary = order.map((value): [string, number] => [value, 1])
      expect(resultExtremes(DECK, summary)).toEqual({ low: '0.5', high: '89' })
    }
  })
})
