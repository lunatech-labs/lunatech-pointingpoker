export type Short = { kind: 'link' | 'text'; text: string }

// What a history row shows of the issue: a link without its query and fragment, else the text on one line.
export function shortForm(issue: string, position: number): Short {
  const trimmed = issue.trim()
  if (trimmed === '') return { kind: 'text', text: `Round ${position}` }
  if (/^https?:\/\/\S+$/i.test(trimmed)) return { kind: 'link', text: trimmed.split(/[?#]/)[0] }
  return { kind: 'text', text: trimmed.replace(/\s+/g, ' ') }
}
