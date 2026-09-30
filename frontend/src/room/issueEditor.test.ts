import { describe, expect, it } from 'vitest'
import { initial, shows, step, type EditorEvent } from './issueEditor'

const pencil: EditorEvent = { type: 'pencil' }
const save: EditorEvent = { type: 'save' }
const cancel: EditorEvent = { type: 'cancel' }
const theirs: EditorEvent = { type: 'theirs' }
const succeeded: EditorEvent = { type: 'succeeded' }
const failed: EditorEvent = { type: 'failed' }
const typed = (text: string): EditorEvent => ({ type: 'typed', text })
const frame = (issue: string): EditorEvent => ({ type: 'snapshot', issue })

// Each case starts in a room whose issue is PP-1.
const after = (...events: EditorEvent[]) => shows(events.reduce(step, initial('PP-1')))
const viewing = (text: string) => ({ mode: 'viewing', text, notice: null, failed: false })
const editing = (text: string, notice: string | null = null, isFailed = false) => ({
  mode: 'editing',
  text,
  notice,
  failed: isFailed
})
const saving = (text: string) => ({ mode: 'saving', text, notice: null, failed: false })
const editingMine = [pencil, typed('mine')]
const savingMine = [...editingMine, save]

describe('the editor while viewing', () => {
  it("shows the room's issue, and follows it", () => {
    expect(after()).toEqual(viewing('PP-1'))
    expect(after(frame('PP-1'))).toEqual(viewing('PP-1'))
    expect(after(frame('PP-2'))).toEqual(viewing('PP-2'))
  })

  it("opens on the pencil with the room's issue as draft and starting point", () => {
    expect(after(frame('PP-2'), pencil)).toEqual(editing('PP-2'))
  })

  it('ignores Enter, the check, Escape and the cancel', () => {
    expect(after(save)).toEqual(viewing('PP-1'))
    expect(after(cancel)).toEqual(viewing('PP-1'))
  })
})

describe('the editor while editing', () => {
  it('updates the draft on typing', () => {
    expect(after(...editingMine)).toEqual(editing('mine'))
  })

  it('saves on Enter or the check', () => {
    expect(after(...savingMine)).toEqual(saving('mine'))
  })

  it("drops the draft on Escape or the cancel and shows the room's issue", () => {
    expect(after(...editingMine, cancel)).toEqual(viewing('PP-1'))
    expect(after(...editingMine, frame('PP-2'), cancel)).toEqual(viewing('PP-2'))
  })

  it('keeps the draft through a snapshot with the issue unchanged', () => {
    expect(after(...editingMine, frame('PP-1'))).toEqual(editing('mine'))
  })

  it("keeps the draft through a changed issue, with the notice naming the room's issue", () => {
    expect(after(...editingMine, frame('PP-2'))).toEqual(editing('mine', 'PP-2'))
  })

  it('names an issue someone emptied, which the notice shows as ""', () => {
    expect(after(...editingMine, frame(''))).toEqual(editing('mine', ''))
  })

  it("shows no notice while the room's issue matches the starting point or the draft", () => {
    expect(after(...editingMine, frame('PP-2'), frame('PP-1'))).toEqual(editing('mine'))
    expect(after(...editingMine, frame('mine'))).toEqual(editing('mine'))
    // An untouched draft is the starting point, so any change is someone else's.
    expect(after(pencil, frame('PP-2'))).toEqual(editing('PP-1', 'PP-2'))
  })

  it("takes the room's issue as draft and starting point on Use theirs", () => {
    expect(after(...editingMine, frame('PP-2'), theirs)).toEqual(editing('PP-2'))
    // Typing again and a later change raise the notice against the new starting point.
    expect(after(...editingMine, frame('PP-2'), theirs, typed('x'), frame('PP-3'))).toEqual(
      editing('x', 'PP-3')
    )
  })
})

describe('the editor while saving', () => {
  it('ignores Enter, the check, Escape, the cancel and typing', () => {
    expect(after(...savingMine, save)).toEqual(saving('mine'))
    expect(after(...savingMine, cancel)).toEqual(saving('mine'))
    expect(after(...savingMine, typed('other'))).toEqual(saving('mine'))
  })

  it('shows nothing of a snapshot, and the next state reads the store', () => {
    expect(after(...savingMine, frame('PP-2'))).toEqual(saving('mine'))
    expect(after(...savingMine, frame('PP-2'), failed)).toEqual(editing('mine', 'PP-2', true))
  })

  it('ignores a snapshot whose issue is unchanged', () => {
    expect(after(...savingMine, frame('PP-1'))).toEqual(saving('mine'))
  })

  it('goes back to viewing on success, showing the saved text', () => {
    expect(after(...savingMine, succeeded)).toEqual(viewing('mine'))
  })

  it('goes back to editing on a failure, a 401 or an abort alike, with the draft kept', () => {
    expect(after(...savingMine, failed)).toEqual(editing('mine', null, true))
  })
})

describe('a failed save', () => {
  it('says so until the editor leaves editing', () => {
    const failedMine = [...savingMine, failed]
    expect(after(...failedMine, typed('mine2'))).toEqual(editing('mine2', null, true))
    expect(after(...failedMine, frame('PP-2'), theirs)).toEqual(editing('PP-2', null, true))
    expect(after(...failedMine, save)).toEqual(saving('mine'))
    expect(after(...failedMine, cancel, pencil)).toEqual(editing('PP-1'))
  })
})

describe('the saved text', () => {
  it('ignores a stale frame, which carries the issue as it was when saving began', () => {
    expect(after(...savingMine, succeeded, frame('PP-1'))).toEqual(viewing('mine'))
  })

  it("ends on the page's own frame and follows the room after it", () => {
    expect(after(...savingMine, succeeded, frame('mine'), frame('PP-1'))).toEqual(viewing('PP-1'))
  })

  it('ends at once on a frame that beat the POST response', () => {
    expect(after(...savingMine, frame('mine'), succeeded)).toEqual(viewing('mine'))
    expect(after(...savingMine, frame('mine'), succeeded, frame('PP-1'))).toEqual(viewing('PP-1'))
  })

  it("ends on someone else's later edit", () => {
    expect(after(...savingMine, succeeded, frame('PP-9'))).toEqual(viewing('PP-9'))
  })

  it('is what the pencil opens, with no notice once the own frame lands', () => {
    expect(after(...savingMine, succeeded, pencil)).toEqual(editing('mine'))
    expect(after(...savingMine, succeeded, pencil, frame('mine'))).toEqual(editing('mine'))
  })
})

describe('the accepted races', () => {
  it('a 10 s abort after the room applied the save: its frame raises no notice', () => {
    expect(after(...savingMine, failed, frame('mine'))).toEqual(editing('mine', null, true))
    expect(after(...savingMine, failed, frame('mine'), save, succeeded)).toEqual(viewing('mine'))
  })

  it("an earlier edit's late frame shows briefly before this one replaces it", () => {
    expect(after(...savingMine, succeeded, frame('PP-2'))).toEqual(viewing('PP-2'))
    expect(after(...savingMine, succeeded, frame('PP-2'), frame('mine'))).toEqual(viewing('mine'))
  })

  it('a page whose own frame never arrives keeps its text until the issue next changes', () => {
    // Restoring exactly PP-1 changes nothing this page can see, since its store still holds it.
    expect(after(...savingMine, succeeded, frame('PP-1'))).toEqual(viewing('mine'))
    // Its own frame and a restore of PP-1 that both beat the response leave the store as it was.
    expect(after(...savingMine, frame('mine'), frame('PP-1'), succeeded)).toEqual(viewing('mine'))
    expect(after(...savingMine, succeeded, frame('PP-3'))).toEqual(viewing('PP-3'))
  })
})
