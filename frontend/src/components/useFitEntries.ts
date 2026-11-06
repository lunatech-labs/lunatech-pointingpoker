import { type RefObject, useLayoutEffect, useRef } from 'react'
import { balancedWidth, largestFit } from '../room/fit'

// The structure switch in rem (3b2 decision 1); container queries have no script API.
const PHONE_BELOW = 51.75

type Fit = { revealed: boolean; names: string[] }

// room.html's fitEntries: the largest --s that fits the table, at most a deck card, rows even.
function fitEntries(box: HTMLElement, list: HTMLUListElement) {
  const root = getComputedStyle(document.documentElement)
  const rem = parseFloat(root.fontSize)
  const token = (name: string) => parseFloat(root.getPropertyValue(name))
  // The phone layout's fixed scale applies only once the wide fit's inline values are gone.
  const page = box.closest('.room-page') ?? box
  if (page.getBoundingClientRect().width / rem < PHONE_BELOW) {
    list.style.removeProperty('--s')
    list.style.removeProperty('max-width')
    return
  }
  // Only the drawn children count: the facilitators' line is hidden outside the phone layout.
  const shown = [...box.children].filter(c => c.getClientRects().length)
  const style = getComputedStyle(box)
  const pad =
    parseFloat(style.paddingTop) +
    parseFloat(style.paddingBottom) +
    parseFloat(style.rowGap) * (shown.length - 1)
  const room = box.clientHeight
  const items = [...list.children] as HTMLElement[]
  // Balanced before it measures, since the balance can move a wrapping name to another row.
  const fits = (s: number) => {
    list.style.setProperty('--s', String(s))
    list.style.removeProperty('max-width')
    if (items.length) {
      const rows = new Set(items.map(e => Math.round(e.offsetTop))).size
      const width = balancedWidth(items.length, rows, items[0].getBoundingClientRect().width)
      if (width !== null) list.style.maxWidth = `${width}px`
    }
    return shown.reduce((h, c) => h + c.getBoundingClientRect().height, pad) <= room
  }
  fits(largestFit(fits, token('--deck-card') / token('--entry-mark')))
}

// Fitted by the observer's first callback, before the first paint, then again on a resize
// of the table or a font load (decision 4).
export function useFitEntries({ revealed, names }: Fit): {
  box: RefObject<HTMLElement | null>
  list: RefObject<HTMLUListElement | null>
} {
  const box = useRef<HTMLElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const voters = names.join('\n')
  useLayoutEffect(() => {
    const table = box.current
    const entries = list.current
    if (!table || !entries) return
    const fit = () => fitEntries(table, entries)
    const watched = new ResizeObserver(fit)
    watched.observe(table)
    document.fonts.addEventListener('loadingdone', fit)
    return () => {
      watched.disconnect()
      document.fonts.removeEventListener('loadingdone', fit)
    }
  }, [revealed, voters])
  return { box, list }
}
