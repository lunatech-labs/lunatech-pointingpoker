import type { ReactNode } from 'react'
import { isLinkIssue } from '../room/history'

// A link issue's rendering inside a new-tab link to its full trimmed URL; any other issue's, bare.
export function IssueLink({
  issue,
  className,
  children
}: {
  issue: string
  className?: string
  children: ReactNode
}) {
  if (!isLinkIssue(issue)) return <>{children}</>
  return (
    <a className={className} href={issue.trim()} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}
