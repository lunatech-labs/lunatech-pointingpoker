// The chart's columns: every deck value in its place, then any value off the deck, as voted.
export function resultColumns(
  deck: readonly string[],
  summary: [string, number][]
): [string, number][] {
  const counts = new Map(summary)
  const offDeck = summary.filter(([value]) => !deck.includes(value))
  return [...deck.map((value): [string, number] => [value, counts.get(value) ?? 0]), ...offDeck]
}
