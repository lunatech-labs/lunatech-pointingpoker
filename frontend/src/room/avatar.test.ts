import { describe, expect, it } from 'vitest'
import { avatarPair, initials } from './avatar'

describe('avatarPair', () => {
  it("matches the mockup's hash", () => {
    expect(['Alexandra Vasquez-Ferreira', 'Bob', 'Ivan', 'Peggy', 'Victor', 'Łukasz', ''].map(avatarPair))
      .toEqual([12, 11, 12, 2, 9, 5, 8])
  })
})

describe('initials', () => {
  it('takes the first two words, split at spaces and hyphens', () => {
    expect(initials('Alexandra Vasquez-Ferreira')).toBe('AV')
    expect(initials('ivan')).toBe('I')
    expect(initials('  Jean-Luc  Picard ')).toBe('JL')
  })
})
