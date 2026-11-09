// The chart's columns: every deck value in its place, then any value off the deck, as voted.
export function resultColumns(
  deck: readonly string[],
  summary: [string, number][]
): [string, number][] {
  const counts = new Map(summary)
  const offDeck = summary.filter(([value]) => !deck.includes(value))
  return [...deck.map((value): [string, number] => [value, counts.get(value) ?? 0]), ...offDeck]
}

export type Headline = {
  label: 'Most voted' | 'Nobody voted'
  tied: string[] // the tied set, in chart order
  figure: string[] // drawn one by one, ' · ' between
  sub: string
  spoken: string
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function resultHeadline(deck: readonly string[], summary: [string, number][]): Headline {
  if (summary.length === 0) {
    return { label: 'Nobody voted', tied: [], figure: [], sub: '', spoken: '' }
  }
  // The summary arrives sorted by count, highest first.
  const top = summary[0][1]
  const tied = resultColumns(deck, summary)
    .filter(([, count]) => count === top)
    .map(([value]) => value)
  if (tied.length === 1) {
    const total = summary.reduce((sum, [, count]) => sum + count, 0)
    return {
      label: 'Most voted',
      tied,
      figure: tied,
      sub: `${top} of ${plural(total, 'vote')}`,
      spoken: tied[0]
    }
  }
  if (tied.length >= 4) {
    return {
      label: 'Most voted',
      tied,
      figure: ['Tie'],
      sub: `${tied.length} values, ${plural(top, 'vote')} each`,
      spoken: 'Tie'
    }
  }
  return {
    label: 'Most voted',
    tied,
    figure: tied,
    sub: `Tied, ${plural(top, 'vote')} each`,
    spoken: `${tied.slice(0, -1).join(', ')} and ${tied[tied.length - 1]}`
  }
}

// The lowest and highest voted values by deck order, '?' excluded; null when fewer than two differ.
export function resultExtremes(
  deck: readonly string[],
  summary: [string, number][]
): { low: string; high: string } | null {
  const voted = new Set(summary.map(([value]) => value))
  const ranked = deck.filter((value) => value !== '?' && voted.has(value))
  return ranked.length < 2 ? null : { low: ranked[0], high: ranked[ranked.length - 1] }
}
