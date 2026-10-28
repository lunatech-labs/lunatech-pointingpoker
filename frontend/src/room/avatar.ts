// colours.css holds the avatar pairs; tokens.gate.test.ts holds them to this count.
export const AVATAR_PAIRS = 14

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

export const avatarPair = (name: string): number => hash(name) % AVATAR_PAIRS + 1

// A word's first grapheme, so an emoji or a flag is drawn whole.
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const first = (word: string) => graphemes.segment(word).containing(0)?.segment ?? ''

export const initials = (name: string): string =>
  name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map(first).join('').toUpperCase()
