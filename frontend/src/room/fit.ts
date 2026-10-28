// The largest scale in steps of 0.02 up to cap that a bisection saw fit, or 1 when none did.
export function largestFit(fits: (scale: number) => boolean, cap: number): number {
  const scale = (step: number) => (50 + step) / 50
  // A bisection over whole steps: lo is 0 or a step that fit, hi a step that did not.
  let lo = 0
  let hi = Math.floor(cap * 50) - 50
  if (fits(scale(hi))) return scale(hi)
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (fits(scale(mid))) lo = mid
    else hi = mid
  }
  return scale(lo)
}

// The width that wraps count entries evenly over rows, or null when there is nothing to balance.
export function balancedWidth(count: number, rows: number, entryWidth: number): number | null {
  if (rows <= 1) return null
  return Math.ceil(count / rows) * entryWidth + 1
}
