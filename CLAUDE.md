# Working on this repository

## Open work

Open work lives in this repository's GitHub issues, including findings a PR
surfaces; the PR links its issue. When asked what is next, list the open
issues. Before drafting a new issue, search open and closed issues for it.

## Two lanes

- Light lane when a change adds no state, timer, protocol change or contract other steps build on, has at most one open decision, its acceptance fits a few test cases, and its phone and desktop forms are both obvious.
- A light change gets a change note under 30 lines in `docs/superpowers/specs/` (Problem, Acceptance, Decision, Tests, and a Review line giving each lens's material and accepted counts) and no plan.
- Everything else takes the full lane: spec, review, plan, with plans kept. A spec's length follows the change's risk, not a template.
- A light change that gains a second decision or any state moves to the full lane.

## Lessons

- Prove a new or changed test can fail: break the mechanism it names, see it go red, revert.
- After reverting a mutation, rebuild (`npm run build`): `pree2e` leaves the mutated bundle in
  `frontend/dist`, which a manual run then serves.
- Cite symbols, case names and section headings, not line numbers; pin a deliberately historical citation to a main commit; do not retrofit.
- Re-check citations in every file a branch changed as its last act and after every rebase, verifying the claim, not just the line.
- Raise tsconfig's target and lib (ES2024 at most on TypeScript 5.9) and Vite's build.target together, with the first change that wants a newer API.
- Never put information only on hover; phones have none.
- Design a feature's phone form together with its desktop one: the information is on both layouts; the form may differ.
- Keep the app a tool, not a platform: no accounts, gating roles, onboarding tours, avatars, sounds, gamification or settings pages.
- No confirmation dialog on routine actions; protect a destructive one by position and styling, or by undo.
- Never show a state by colour or an icon alone: words first, icons beside them.
- Justify a narrow width or a zoom by the effective-viewport uses in `docs/superpowers/specs/2026-10-30-ui-refresh-4c1-narrow-cases-design.md`, decision 3; 400% zoom is not one of them. 320 px stands for the first iPhone SE and WCAG 1.4.10's reflow width.
