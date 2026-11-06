import { type RefObject, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { firstFit, nameCandidates } from '../room/fit'

// The line's font as computed longhands; the shorthand's serialisation is not guaranteed in Firefox.
const FONT = [
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'fontStretch',
  'fontVariant',
  'fontFeatureSettings',
  'fontVariationSettings',
  'fontKerning',
  'letterSpacing',
  'wordSpacing',
  'textTransform'
] as const

// The first candidate whose text, after the label, a scratch node built as text measures within the line.
function fitted(line: HTMLElement, label: string, names: string[]): string {
  const drawn = getComputedStyle(line)
  const room =
    line.getBoundingClientRect().width - parseFloat(drawn.paddingLeft) - parseFloat(drawn.paddingRight)
  const scratch = document.createElement('span')
  const bold = document.createElement('b')
  const rest = document.createElement('span')
  for (const name of FONT) scratch.style[name] = drawn[name]
  scratch.style.position = 'absolute'
  scratch.style.visibility = 'hidden'
  scratch.style.whiteSpace = 'nowrap'
  scratch.style.width = 'max-content'
  scratch.setAttribute('aria-hidden', 'true')
  bold.style.fontWeight = getComputedStyle(line.querySelector('b') ?? line).fontWeight
  bold.textContent = `${label}:`
  scratch.append(bold, rest)
  try {
    document.body.append(scratch)
    return firstFit(nameCandidates(names), text => {
      rest.textContent = ` ${text}`
      return scratch.getBoundingClientRect().width <= room
    })
  } finally {
    scratch.remove()
  }
}

// The line's text after its label: fitted before paint on a change of names, refitted on a resize or a font load.
export function useFitLine(
  label: string,
  names: string[]
): { line: RefObject<HTMLParagraphElement | null>; text: string } {
  const line = useRef<HTMLParagraphElement>(null)
  const [text, setText] = useState(() => names.join(', '))
  const key = `${label}\n${names.join('\n')}`
  useLayoutEffect(() => {
    const drawn = line.current
    if (!drawn) return
    const fit = () => setText(fitted(drawn, label, names))
    const refit = () => flushSync(fit)
    fit()
    const watched = new ResizeObserver(refit)
    watched.observe(drawn)
    document.fonts.addEventListener('loadingdone', refit)
    return () => {
      watched.disconnect()
      document.fonts.removeEventListener('loadingdone', refit)
    }
    // The key stands for label and names, whose array is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return { line, text }
}
