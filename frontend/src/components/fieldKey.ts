import type { KeyboardEvent } from 'react'

// The key a form's field acts on; a repeat or an input method's composition acts on nothing.
export function fieldKey(e: KeyboardEvent): 'Enter' | 'Escape' | null {
  if (e.repeat) return null
  // Enter also confirms a composition; Safari ends it first, so that Enter has keyCode 229.
  if (e.nativeEvent.isComposing || e.keyCode === 229) return null
  return e.key === 'Enter' || e.key === 'Escape' ? e.key : null
}
