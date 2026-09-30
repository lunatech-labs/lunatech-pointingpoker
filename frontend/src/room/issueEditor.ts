// The issue editor's states and events, the spec's matrix; useIssueEditor wires it to React.
export type Mode = 'viewing' | 'editing' | 'saving'

export type EditorState = {
  mode: Mode
  // The store's issue, as the last snapshot carried it.
  store: string
  draft: string
  start: string
  failed: boolean
  // The store's issue when saving began, which the saved text waits for the store to leave.
  before: string
  saved: string | null
}

export type EditorEvent =
  | { type: 'pencil' }
  | { type: 'typed'; text: string }
  | { type: 'save' }
  | { type: 'cancel' }
  | { type: 'theirs' }
  | { type: 'snapshot'; issue: string }
  | { type: 'succeeded' }
  | { type: 'failed' }

export const initial = (issue: string): EditorState => ({
  mode: 'viewing',
  store: issue,
  draft: '',
  start: '',
  failed: false,
  before: issue,
  saved: null
})

// The spec's "room's issue": the store's, or the saved text while it waits.
const roomIssue = (s: EditorState) => s.saved ?? s.store

// Every event outside its state is ignored, which covers the matrix's "Cannot happen" cells too.
export function step(s: EditorState, e: EditorEvent): EditorState {
  switch (e.type) {
    case 'snapshot':
      return { ...s, store: e.issue, saved: e.issue === s.before ? s.saved : null }
    case 'pencil':
      if (s.mode !== 'viewing') return s
      return { ...s, mode: 'editing', draft: roomIssue(s), start: roomIssue(s), failed: false }
    case 'typed':
      return s.mode === 'editing' ? { ...s, draft: e.text } : s
    case 'save':
      return s.mode === 'editing' ? { ...s, mode: 'saving', failed: false, before: s.store } : s
    case 'cancel':
      return s.mode === 'editing' ? { ...s, mode: 'viewing' } : s
    case 'theirs':
      return s.mode === 'editing' ? { ...s, draft: roomIssue(s), start: roomIssue(s) } : s
    case 'succeeded':
      if (s.mode !== 'saving') return s
      // A frame that beat the response has already moved the store, so nothing is left to wait for.
      return { ...s, mode: 'viewing', saved: s.store === s.before ? s.draft : null }
    case 'failed':
      return s.mode === 'saving' ? { ...s, mode: 'editing', failed: true } : s
  }
}

export type EditorView = { mode: Mode; text: string; notice: string | null; failed: boolean }

export function shows(s: EditorState): EditorView {
  const room = roomIssue(s)
  if (s.mode === 'viewing') return { mode: s.mode, text: room, notice: null, failed: false }
  const conflict = s.mode === 'editing' && room !== s.start && room !== s.draft
  return { mode: s.mode, text: s.draft, notice: conflict ? room : null, failed: s.failed }
}
