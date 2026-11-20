import { type RefObject, useEffect, useLayoutEffect } from 'react'

// Keeps a list at its end when its entries or its height change, and nothing else (round history decision 7).
export function useStickToEnd(ref: RefObject<HTMLElement | null>, count: number): void {
  useLayoutEffect(() => {
    const list = ref.current
    if (list) list.scrollTop = list.scrollHeight
  }, [ref, count])
  useEffect(() => {
    const list = ref.current
    if (!list) return
    let height: number | undefined
    // A width change alone leaves the scroll where it was.
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height === height) return
      height = entry.contentRect.height
      list.scrollTop = list.scrollHeight
    })
    observer.observe(list)
    return () => observer.disconnect()
  }, [ref])
}
