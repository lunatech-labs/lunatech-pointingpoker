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

// A name line's texts after its label, longest first: all names, the first k and "and N more" (N >= 2), then the count.
export function nameCandidates(names: string[]): string[] {
  const n = names.length
  const some = Array.from({ length: Math.max(n - 2, 0) }, (_, i) => n - 2 - i).map(
    k => `${names.slice(0, k).join(', ')} and ${n - k} more`
  )
  return [names.join(', '), ...some, String(n)]
}

// The first candidate that fits; the last, the count, is taken without being measured.
export function firstFit(candidates: string[], fits: (text: string) => boolean): string {
  return candidates.slice(0, -1).find(fits) ?? candidates[candidates.length - 1]
}
