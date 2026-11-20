import { type FocusEventHandler, useState } from 'react'

// Whether focus is inside the element the handlers are spread on, kept as state for render to read.
export function useFocusWithin(): [boolean, { onFocus: FocusEventHandler; onBlur: FocusEventHandler }] {
  const [within, setWithin] = useState(false)
  const onFocus: FocusEventHandler = () => setWithin(true)
  // Focus moving between two of its descendants stays within.
  const onBlur: FocusEventHandler = e => {
    if (!e.currentTarget.contains(e.relatedTarget)) setWithin(false)
  }
  return [within, { onFocus, onBlur }]
}
