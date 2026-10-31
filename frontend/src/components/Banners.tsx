import './banners.css'
import { Message } from './Message'

type Props = {
  problem: string
  moved: boolean
  restarted: boolean
  onDismissMoved: () => void
  onDismissRestarted: () => void
}

// The dismiss target: the page's one h1 marked data-dismiss-focus (4c2-banners decision 3).
const dismiss = (onDismiss: () => void) => () => {
  document.querySelector<HTMLElement>('[data-dismiss-focus]')?.focus()
  onDismiss()
}

export function Banners(props: Props) {
  const { problem, moved, restarted, onDismissMoved, onDismissRestarted } = props
  if (!problem && !moved && !restarted) return null
  return (
    <section className="banners" aria-label="Messages">
      {problem && (
        <Message tone="problem" role="alert">
          {problem}
        </Message>
      )}
      {moved && (
        <Message tone="notice" role="status" onDismiss={dismiss(onDismissMoved)}>
          The old link you followed now opens this address. Please update your invitation or
          bookmark to use it.
        </Message>
      )}
      {restarted && (
        <Message tone="notice" role="status" onDismiss={dismiss(onDismissRestarted)}>
          Reconnected. Please check your vote.
        </Message>
      )}
    </section>
  )
}
