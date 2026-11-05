# Working on this repository

## Open work

Open work lives in this repository's GitHub issues, including findings a PR
surfaces; the PR links its issue. When asked what is next, list the open
issues. Before drafting a new issue, search open and closed issues for it.

## Lessons

- Prove a new or changed test can fail: break the mechanism it names, see it go red, revert.
- Cite symbols, case names and section headings, not line numbers; pin a deliberately historical citation to a main commit; do not retrofit.
- Re-check citations in every file a branch changed as its last act and after every rebase, verifying the claim, not just the line.
- Raise tsconfig's target and lib (ES2024 at most on TypeScript 5.9) and Vite's build.target together, with the first change that wants a newer API.
- Never put information only on hover; phones have none.
- Keep the app a tool, not a platform: no accounts, gating roles, onboarding tours, avatars, sounds, gamification or settings pages.
- No confirmation dialog on routine actions; protect a destructive one by position and styling, or by undo.
- Never show a state by colour or an icon alone: words first, icons beside them.
