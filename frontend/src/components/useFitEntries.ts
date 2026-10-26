import { type RefObject, useLayoutEffect, useRef } from 'react'
import { balancedWidth, largestFit } from '../room/fit'

// The structure switch in rem (3b2 decision 1); container queries have no script API.
const PHONE_BELOW = 51.75

type Fit = { reserve: boolean; revealed: boolean; names: string[] }

// room.html's fitEntries: the largest --s that fits the table, at most a deck card, rows even.
function fitEntries(box: HTMLElement, list: HTMLUListElement, reserve: boolean) {
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
  // The facilitator's slot appears at a reveal, so its height, gaps and borders are held back.
  const held = reserve
    ? (token('--slot-height') + 3 * token('--panel-gap')) * rem + 2 * token('--line-hairline')
    : 0
  // Only the drawn children count: the facilitators' line is hidden outside the phone layout.
  const shown = [...box.children].filter(c => c.getClientRects().length)
  const style = getComputedStyle(box)
  const pad =
    parseFloat(style.paddingTop) +
    parseFloat(style.paddingBottom) +
    parseFloat(style.rowGap) * (shown.length - 1)
  const room = Math.floor(box.clientHeight - held)
  const fits = (s: number) => {
    list.style.setProperty('--s', String(s))
    list.style.removeProperty('max-width')
    return shown.reduce((h, c) => h + c.getBoundingClientRect().height, pad) <= room
  }
  fits(largestFit(fits, token('--deck-card') / token('--entry-mark')))
  const items = [...list.children] as HTMLElement[]
  if (!items.length) return
  const rows = new Set(items.map(e => Math.round(e.offsetTop))).size
  const width = balancedWidth(items.length, rows, items[0].getBoundingClientRect().width)
  if (width === null) list.style.removeProperty('max-width')
  else list.style.maxWidth = `${width}px`
}

// Fitted before the first paint, again on a resize of the table or a font load (decision 4).
export function useFitEntries({ reserve, revealed, names }: Fit): {
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
    const fit = () => fitEntries(table, entries, reserve)
    fit()
    const watched = new ResizeObserver(fit)
    watched.observe(table)
    document.fonts.addEventListener('loadingdone', fit)
    return () => {
      watched.disconnect()
      document.fonts.removeEventListener('loadingdone', fit)
    }
  }, [reserve, revealed, voters])
  return { box, list }
}
