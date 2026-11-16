import { describe, expect, it } from 'vitest'
import { shortForm } from './history'

describe('shortForm', () => {
  it.each([
    [
      'Jira',
      'https://lunatech.atlassian.net/browse/PP-1234',
      1,
      'link',
      'https://lunatech.atlassian.net/browse/PP-1234'
    ],
    [
      'Jira with a query',
      'https://acme.atlassian.net/browse/PP-1234?atlOrigin=eyJpIjoi',
      1,
      'link',
      'https://acme.atlassian.net/browse/PP-1234'
    ],
    [
      'Jira board',
      'https://acme.atlassian.net/jira/software/projects/PP/boards/3?selectedIssue=PP-77',
      1,
      'link',
      'https://acme.atlassian.net/jira/software/projects/PP/boards/3'
    ],
    [
      'fragment',
      'https://github.com/acme/web/issues/412#issuecomment-1',
      1,
      'link',
      'https://github.com/acme/web/issues/412'
    ],
    [
      'trailing space',
      'https://github.com/acme/web/issues/412 ',
      1,
      'link',
      'https://github.com/acme/web/issues/412'
    ],
    ['upper-case scheme', 'HTTPS://example.com/ticket', 1, 'link', 'HTTPS://example.com/ticket'],
    [
      'link and words',
      'https://github.com/acme/web/issues/412 and PP-9',
      1,
      'text',
      'https://github.com/acme/web/issues/412 and PP-9'
    ],
    ['key and title', 'PP-1234 Fix the login form', 1, 'text', 'PP-1234 Fix the login form'],
    [
      'sentence over lines',
      'Rework the login page\n  so that…',
      1,
      'text',
      'Rework the login page so that…'
    ],
    ['empty', '', 3, 'text', 'Round 3'],
    ['blank', '   ', 3, 'text', 'Round 3']
  ] as const)('%s', (_case, issue, position, kind, text) => {
    expect(shortForm(issue, position)).toEqual({ kind, text })
  })
})
