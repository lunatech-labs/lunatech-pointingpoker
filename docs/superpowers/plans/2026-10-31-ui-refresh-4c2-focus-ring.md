# UI Refresh Step 4c2-focus-ring: The Quiet Buttons' Rounded Ring, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `.button-quiet` takes `--radius-control`, so a quiet button's focus ring is rounded like the other buttons'.

**Architecture:** One declaration in `looks.css`; the mockups in `docs/design/` load the same file and follow.

**Tech Stack:** plain CSS; Playwright (Chromium and Firefox).

**Spec:** `docs/superpowers/specs/2026-10-31-ui-refresh-4c2-focus-ring-design.md`

## How this plan was verified

- **Checked in the code:**
  - `.button` sets `border-radius: var(--radius-control)` after its `border`; `.button-quiet` sets `border: 0` and no radius.
  - The quiet buttons: Dismiss and Use theirs (`Message.tsx`), Edit (`IssuePanel.tsx`), Clear votes (`RoundBar.tsx`), the menu button, Switch to… and Leave (`RoomHeader.tsx`).
  - No case in `e2e` or `frontend/src` reads a radius or takes a screenshot.
  - The parent's step 4 change is made, committed with this plan.

## Rulings this plan makes, for the user's review

- **R1. The declaration follows `border: 0;`**, as `.button`'s follows its `border`. Set aside: the rule's end.
- **R2. The commit type is `fix`**: the quiet buttons now follow J9's Corners, which they never did. Set aside: `style`, which Conventional Commits keeps for formatting.
- **R3. The cases run as the whole suite**, in both projects, as 4c2-bootstrap's did for a shared stylesheet. Set aside: a list of files.

## Global Constraints

**Branch and commits:**
- Branch `20260930.ui_refresh_4c2_focus_ring`, stacked on `20260930.ui_refresh_4c2_bootstrap` (#479). New commits only: no amend, rebase or force-push, and nothing pushed until the user asks.
- Commit subjects, verbatim:
  - Task 0: `docs: specify and plan the quiet buttons' rounded ring (ui refresh step 4c2-focus-ring)`
  - Task 1: `fix: round the quiet buttons' focus ring (ui refresh step 4c2-focus-ring)`
- No "Generated with Claude Code" or co-author line.

**Running:**
- Checks: `npm run typecheck && npm run lint && npm run test:unit`.
- Browser: `npm run build && npx playwright test --workers=1`. The default worker count ran the workstation out of memory on 2026-10-28.

## Review Focus

- Each quiet button reached by Tab shows a rounded ring, in Chromium and Firefox (spec, Cases). By hand.
- Use theirs, inside the notice's sentence: its ring is rounded and the sentence does not move. By hand.
- A quiet button clicked with the mouse still shows no ring. By hand.
- The `h1` a Dismiss focuses keeps its square ring (spec decision 2).

---

### Task 0: Commit the spec, the parent's change and the plan

- [ ] **Step 1:** Commit `docs/superpowers/specs/2026-10-31-ui-refresh-4c2-focus-ring-design.md`, `docs/superpowers/specs/2026-09-30-ui-refresh-design.md` and this plan with Task 0's subject.

### Task 1: The quiet buttons' radius

Judged by the existing cases unchanged and the hand check (spec, Cases).

**Files:**
- Modify: `frontend/src/components/looks.css`, `docs/design/ui-reference.md`, `docs/known-issues.md`

**Interfaces:** none; no component, prop or case changes.

- [ ] **Step 1: The rule (R1).** In `.button-quiet`, after `border: 0;`, add `border-radius: var(--radius-control);`.
- [ ] **Step 2: Run the checks and the cases (R3).** Expected: PASS, no case edited.
- [ ] **Step 3: J9's Corners.** In `docs/design/ui-reference.md`, the Corners bullet becomes:

```markdown
- **Corners** are rounded (3b1's second look): panels and messages take
  `--radius`, cards, rows and inputs `--radius-card`, buttons, quiet ones
  included, `--radius-control`; the tokens hold the rest.
```

- [ ] **Step 4: The log.** In the same file, after the **4c2-bootstrap.** log entry, add:

```markdown
- **4c2-focus-ring.** The quiet buttons (the UI refresh design's step
  4c2-focus-ring) take `--radius-control`, as J9's Corners give every button,
  so their focus ring is rounded like the others'. Ruled by the project's
  owner; the designer validates it on the deployed app. The `h1`s a Dismiss
  focuses keep a square ring: J9 rounds controls, not headings. Set aside:
  waiting for the designer's ruling; rounding every focus target.
```

- [ ] **Step 5: The known issue.** In `docs/known-issues.md`, delete the section "The focus ring is square on quiet buttons, rounded on the others", from its heading through its Resolution and the blank line after it.
- [ ] **Step 6: Commit** the three files with Task 1's subject.
