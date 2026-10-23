// The largest scale in steps of 0.02, from 1 up to cap, that still fits (10 bisections)
export function largestFit(fits: (scale: number) => boolean, cap: number): number {
  let lo = 1
  let hi = cap
  if (fits(hi)) lo = hi
  else {
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2
      if (fits(mid)) lo = mid
      else hi = mid
    }
  }
  return Math.floor(lo * 50) / 50
}

// The width that wraps count entries evenly over rows, or null when there is nothing to balance
export function balancedWidth(count: number, rows: number, entryWidth: number): number | null {
  if (rows <= 1) return null
  return Math.ceil(count / rows) * entryWidth + 1
}
