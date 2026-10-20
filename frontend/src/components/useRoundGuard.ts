import { useEffect, useState } from 'react'

const GUARD_MS = 1000

// Guarded for 1 s after each flip of the phase, computed in the render that shows the flip.
export function useRoundGuard(revealed: boolean): boolean {
  const [seen, setSeen] = useState(revealed)
  const [flips, setFlips] = useState(0)
  const [guarded, setGuarded] = useState(false)
  if (seen !== revealed) {
    setSeen(revealed)
    setFlips(f => f + 1)
    setGuarded(true)
  }
  useEffect(() => {
    if (flips === 0) return
    const timer = setTimeout(() => setGuarded(false), GUARD_MS)
    return () => clearTimeout(timer)
  }, [flips])
  return guarded
}
