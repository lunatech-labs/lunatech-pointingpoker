// colours.css holds the avatar pairs; tokens.gate.test.ts holds them to this count
export const AVATAR_PAIRS = 14

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

export const avatarPair = (name: string): number => hash(name) % AVATAR_PAIRS + 1

export const initials = (name: string): string =>
  name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
