import { useReducer } from 'react'
import { initial, shows, step } from '../room/issueEditor'

// The editor's state machine held in React; the save's promise answers it with success or failure.
export function useIssueEditor(
  issue: string,
  round: number,
  save: (issue: string) => Promise<void>
) {
  const [state, dispatch] = useReducer(step, { issue, round }, ({ issue, round }) =>
    initial(issue, round)
  )
  // Folded in during render rather than in an effect, so no frame shows the old issue or round.
  if (issue !== state.store || round !== state.round) dispatch({ type: 'snapshot', issue, round })

  const submit = () => {
    if (state.mode !== 'editing') return
    dispatch({ type: 'save' })
    save(state.draft).then(
      () => dispatch({ type: 'succeeded' }),
      () => dispatch({ type: 'failed' })
    )
  }

  return {
    ...shows(state),
    pencil: () => dispatch({ type: 'pencil' }),
    type: (text: string) => dispatch({ type: 'typed', text }),
    submit,
    cancel: () => dispatch({ type: 'cancel' }),
    takeTheirs: () => dispatch({ type: 'theirs' })
  }
}
