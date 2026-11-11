// The notice that replaces a form once the room moves on (spec's Terms).
export const movedOnText = (issue: string) =>
  issue ? `The room moved on to: "${issue}"` : 'The room moved on, with no issue yet'
