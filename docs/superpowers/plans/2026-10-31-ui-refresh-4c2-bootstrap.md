# UI Refresh Step 4c2-bootstrap: Bootstrap Removed, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap, its pin, `bootstrap-undo.css`, the `legacy` layer and the `.legacy-page` fence go, and Bootstrap's two phone properties move to `page.css`, with nothing visible changing.

**Architecture:** `base.css` keeps `base` as its one layer (the reset, then `page.css`) beneath the unlayered looks, colours and tokens. The dependency goes through npm, so the lockfile drops Bootstrap's peers with it.

**Tech Stack:** npm, Vite, plain CSS; Playwright (Chromium and Firefox).

**Spec:** `docs/superpowers/specs/2026-10-31-ui-refresh-4c2-bootstrap-design.md`

## How this plan was verified

- **Checked in the code:**
  - Bootstrap 4.6.2's minified `html` rule ends `-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent`, and today's build CSS holds each once, plus `--breakpoint-xl` once (a Bootstrap custom property).
  - In `package-lock.json`, `node_modules/jquery` and `node_modules/popper.js` carry `"peer": true` and nothing else requires them.
  - Outside `base.css` and `bootstrap-undo.css`, nothing in `frontend/src` or `e2e` names Bootstrap or `legacy-page`; the other `legacy` hits are the legacy link, unrelated.
  - `frontend/src/design/tokens.gate.test.ts` reads every stylesheet in `frontend/src` and requires only `base.css`, `fonts.css` and `reset.css`; `literalProblems` flags px, hex, named colours and colour functions, and `transparent` is not among them (`looks.css` already uses it).
  - `dependabot.yml` sits outside `.github/workflows`, so the gh token's missing workflow scope does not apply.
  - The parent's step 4 change is in 4ceee72.

## Rulings this plan makes, for the user's review

- **R1. npm drops the dependency**, `npm uninstall bootstrap`, which prunes the peers from the lockfile; then `npm ci` installs from the result, as Clever's build does. Set aside: editing `package.json` and the lockfile by hand.
- **R2. The two declarations join the existing `html` rule** in `page.css`, after `scrollbar-gutter`, under an in-rule comment, as `reset.css` comments inside `body`. Set aside: a second `html` rule, which splits one element's rules.
- **R3. The build check runs before the declarations go in**, after Bootstrap's removal, where it must read 0 for both: that proves it can fail at no extra cost. Set aside: a mutation after the commit.
- **R4. The cases run as the whole suite**, in both projects, since the change reaches every page. Set aside: a list of files, which a stylesheet change cannot be scoped to.
- **R5. The commit type is `refactor`**: nothing visible changes, and most of the diff is stylesheets. Set aside: `build`, which this repo uses for dependency bumps and the build itself.

## Global Constraints

**Branch and commits:**
- Branch `20260930.ui_refresh_4c2_bootstrap`, stacked on `20260930.ui_refresh_4c2_banners` (#478). The spec and the parent's step 4 change are committed (4ceee72). New commits only: no amend, rebase or force-push, and nothing pushed until the user asks.
- Commit subjects, verbatim:
  - Task 0: `docs: plan Bootstrap's removal (ui refresh step 4c2-bootstrap)`
  - Task 1: `refactor: remove Bootstrap (ui refresh step 4c2-bootstrap)`
- No "Generated with Claude Code" or co-author line.

**Code:**
- Comments are one or two lines, with no em dash. Lines under about 100 characters.
- `base.css`'s header comment, verbatim: `/* base holds the reset and page.css; looks, colours and tokens stay unlayered, above it. */`
- `page.css`'s comment above the declarations, verbatim: `/* No grey tap flash, no landscape text boost on phones (4c2-bootstrap decision 2) */`
- The declarations, verbatim: `-webkit-tap-highlight-color: transparent;` then `-webkit-text-size-adjust: 100%;`

**Running:**
- Checks: `npm run typecheck && npm run lint && npm run test:unit`.
- The build check: `npm run build && for s in -webkit-tap-highlight-color:transparent -webkit-text-size-adjust:100% --breakpoint-xl; do echo "$s $(cat frontend/dist/assets/index-*.css | grep -o -- "$s" | wc -l)"; done`
- Browser: `npm run build && npx playwright test --workers=1`. The default worker count ran the workstation out of memory on 2026-10-28.

## Review Focus

- A phone: no grey flash on a tap, and no text enlarged in landscape on iOS Safari (spec decision 2). On the deployed app when a phone is at hand; never a gate.
- A button clicked with the mouse shows no focus ring, and one reached by Tab shows it, in both browsers (spec, Accepted costs, the outline width). By hand.
- The lobby's tab legend and the roster's separator look as on 4c2-banners' tip (spec, Accepted costs). By hand at 1280 by 700 and 320 by 640.
- A clean install: `npm ci` from the new lockfile succeeds, as Clever builds from source (Task 1, Step 1).
- Firefox: the whole suite runs in both projects; a Firefox-only failure is a finding, not a flake to retry past.

---

### Task 0: Commit the plan

- [ ] **Step 1:** Commit this plan with Task 0's subject.

### Task 1: Bootstrap removed

Judged by the existing cases unchanged and decision 2's build check (spec, Cases).

**Files:**
- Modify: `package.json`, `package-lock.json`, `.github/dependabot.yml`, `frontend/src/base.css`, `frontend/src/page.css`, `docs/design/ui-reference.md`
- Delete: `frontend/src/bootstrap-undo.css`

**Interfaces:** none; no component, prop or case changes.

- [ ] **Step 1: The dependency (R1).** Run `npm uninstall bootstrap`, then `npm ci`. Expected: `grep -c '"node_modules/\(bootstrap\|jquery\|popper.js\)"' package-lock.json` prints 0, and `git diff package-lock.json` removes only those three entries and `bootstrap`'s root line. If the lockfile changes anything else, **stop and report**.
- [ ] **Step 2: Dependabot.** In `.github/dependabot.yml`, delete the `bootstrap` ignore entry and its comment line ("Bootstrap 5 would break…"); the `typescript` entry and its comment stay.
- [ ] **Step 3: The layer.** Rewrite `base.css` as the header comment (Global Constraints), then the imports in order: `'./reset.css' layer(base)`, `'./page.css' layer(base)`, `'./components/looks.css'`, `'./colours.css'`, `'./tokens.css'`. Gone: the `@layer` statement, Bootstrap's import, `bootstrap-undo.css`'s import, the fence and its comment. Delete `frontend/src/bootstrap-undo.css`.
- [ ] **Step 4: Run the build check to see it fail (R3).** Expected: `-webkit-tap-highlight-color:transparent 0`, `-webkit-text-size-adjust:100% 0`, `--breakpoint-xl 0`.
- [ ] **Step 5: The phone properties.** In `page.css`'s `html` rule, after `scrollbar-gutter: stable;`, add the comment and the two declarations (Global Constraints, R2).
- [ ] **Step 6: Run the build check.** Expected: `1`, `1`, `0`.
- [ ] **Step 7: Run the checks and the cases (R4).** Checks; then the whole suite in both projects. Expected: PASS, no case edited.
- [ ] **Step 8: The docs' change.** In `docs/design/ui-reference.md`, after the **4c2-banners.** log entry, add, wrapped as its neighbours:

```markdown
- **4c2-bootstrap.** Removing Bootstrap (the UI refresh design's step
  4c2-bootstrap) kept its two phone properties on `html` in `page.css`:
  `-webkit-tap-highlight-color: transparent`, so a tap does not flash grey in
  Chromium and Safari, and `-webkit-text-size-adjust: 100%`, so iOS Safari does
  not enlarge text in landscape. Set aside: dropping either; tap feedback
  through `:active` styles, a question for the designer.
```

- [ ] **Step 9: Commit** the seven files with Task 1's subject.
