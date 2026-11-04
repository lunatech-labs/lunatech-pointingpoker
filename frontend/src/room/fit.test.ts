import { describe, expect, it } from 'vitest'
import { balancedWidth, largestFit } from './fit'

const cap = 5.5 / 3.85 // --deck-card over --entry-mark

describe('largestFit', () => {
  it('takes the cap when the cap fits', () => expect(largestFit(() => true, cap)).toBe(1.42))
  it('stays at 1 when nothing above 1 fits', () => expect(largestFit(s => s <= 1, cap)).toBe(1))
  it('stays at 1 when even 1 does not fit', () => expect(largestFit(() => false, cap)).toBe(1))
  it('finds the largest step of 0.02 below the threshold', () =>
    expect(largestFit(s => s <= 1.21, cap)).toBe(1.2))
  it('returns a scale that fits, within a step of the threshold', () => {
    for (let t = 1.05; t < cap; t += 0.05) {
      const s = largestFit(v => v <= t, cap)
      expect(s).toBeLessThanOrEqual(t)
      expect(s).toBeGreaterThan(t - 0.03)
    }
  })
  it('asks at most 6 times, the top step then 5 halvings', () => {
    let asked = 0
    largestFit(s => (asked++, s <= 1.21), cap)
    expect(asked).toBeLessThanOrEqual(6)
  })
  it('returns a step it saw fit when the fit is not monotone', () => {
    // 1.2 fails between passing neighbours, as a row's balance can make it.
    const fits = (s: number) => s <= 1.21 && Math.abs(s - 1.2) > 1e-9
    expect(fits(largestFit(fits, cap))).toBe(true)
  })
})

describe('balancedWidth', () => {
  it('leaves a room of 0 alone', () => expect(balancedWidth(0, 0, 78)).toBeNull())
  it('leaves a room of 1 alone', () => expect(balancedWidth(1, 1, 78)).toBeNull())
  it('leaves one row alone', () => expect(balancedWidth(9, 1, 78)).toBeNull())
  it('splits 14 over two rows as 7 and 7', () => expect(balancedWidth(14, 2, 78)).toBe(547))
  it('splits 14 over three rows as 5, 5 and 4', () => expect(balancedWidth(14, 3, 78)).toBe(391))
  it('splits 13 over two rows as 7 and 6', () => expect(balancedWidth(13, 2, 78)).toBe(547))
})
