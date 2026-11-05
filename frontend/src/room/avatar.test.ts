import { describe, expect, it } from 'vitest'
import { avatarPair, initials } from './avatar'

describe('avatarPair', () => {
  it("matches the mockup's hash", () => {
    const names = ['Alexandra Vasquez-Ferreira', 'Bob', 'Ivan', 'Peggy', 'Victor', 'Łukasz', '']
    expect(names.map(avatarPair)).toEqual([12, 11, 12, 2, 9, 5, 8])
  })
})

describe('initials', () => {
  it('takes the first two words, split at spaces and hyphens', () => {
    expect(initials('Alexandra Vasquez-Ferreira')).toBe('AV')
    expect(initials('ivan')).toBe('I')
    expect(initials('  Jean-Luc  Picard ')).toBe('JL')
  })
  it('takes an emoji past one UTF-16 unit whole', () => expect(initials('🦊 Fox')).toBe('🦊'))
  it('takes a flag whole', () => expect(initials('🇫🇷 Marie')).toBe('🇫🇷'))
  it('takes a joined emoji whole', () => expect(initials('🧑‍💻 Dev')).toBe('🧑‍💻'))
  it.each([
    ['Marie Curie', 'MC'], ['王 小明', '王小'], ['(Bob) Smith', '(S'], ['A B 🤖', 'AB'],
    ['1️⃣ Bob', '1️⃣B'], ['A.N.A.S. 🤖', 'A'], ['Marie 🇫🇷', 'M'], ['(Bob) 🤖', '('],
    ['© Corp', '©'], ['🤖 Anas', '🤖'], ['🍕 🎉', '🍕'], ['🦄', '🦄'],
    ['anas 🤖', 'A'], ['👍🏽 Bob', '👍🏽'],
  ])('%s gives %s', (name, want) => expect(initials(name)).toBe(want))
})
