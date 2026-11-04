# UI Refresh Step 4c2-focus-ring: The Controls' Rounded Ring, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `button` and `a` take `--radius-control` by default, so every control's focus ring is rounded; the lobby's tabs opt out.

**Architecture:** An element rule in `page.css`, in the `base` layer, which every unlayered component rule overrides; one opt-out in `lobby-tabs.css`. The mockups in `docs/design/` load the same files and follow.

**Tech Stack:** plain CSS, cascade layers; Playwright (Chromium and Firefox).

**Spec:** `docs/superpowers/specs/2026-10-31-ui-refresh-4c2-focus-ring-design.md`

## How this plan was verified

- **Checked in the code:**
  - `base.css` imports `reset.css` and `page.css` into `layer(base)`; the components' stylesheets are unlayered.
  - Every `button` and `a` with a border or background sets its own radius: `.button`, `.deck-card`, `.room-row`, `.room-header-copy`. The others (`.button-quiet`, `.room-header-role button`, `.room-header-leave`, `.lobby-tabs a`) have neither, but the current tab's bottom border.
  - No case in `e2e` or `frontend/src` reads a radius or takes a screenshot.

## Rulings this plan makes, for the user's review

- **R1. A rule of its own, just above `:focus-visible`**, since the existing `button` rule does not reach `a`. Set aside: adding `a` to the `button` rule, which also sets the cursor.
- **R2. The opt-out sits on `.lobby-tabs a`**, so both tabs' rings match. Set aside: on `[aria-current]` alone, which rounds one tab's ring and not the other's.
- **R3. The commit type is `fix`**: controls now follow J9's Corners, which the quiet ones never did. Set aside: `style`, which Conventional Commits keeps for formatting.
- **R4. The cases run as the whole suite**, in both projects, as the rule reaches every page. Set aside: a list of files.

## Global Constraints

**Branch and commits:**
- Branch `20260930.ui_refresh_4c2_focus_ring`, stacked on `20260930.ui_refresh_4c2_bootstrap` (#479). New commits only: no amend, rebase or force-push, and nothing pushed until the user asks.
- Commit subjects, verbatim:
  - Task 0: `docs: specify and plan the quiet buttons' rounded ring (ui refresh step 4c2-focus-ring)`, then `docs: round every control's ring by default (ui refresh step 4c2-focus-ring)`
  - Task 1: `fix: round the controls' focus ring (ui refresh step 4c2-focus-ring)`
- No "Generated with Claude Code" or co-author line.

**Code:**
- `page.css`'s rule, verbatim, above `:focus-visible`:

```css
/* Controls are round, so their ring is; a component's own radius wins (4c2-focus-ring) */
button,
a {
  border-radius: var(--radius-control);
}
```

- In `.lobby-tabs a`, last, verbatim: the comment `/* Square: a radius would curve the current tab's bar (4c2-focus-ring decision 2) */` then `border-radius: 0;`.

**Running:**
- Checks: `npm run typecheck && npm run lint && npm run test:unit`.
- Browser: `npm run build && npx playwright test --workers=1`. The default worker count ran the workstation out of memory on 2026-10-28.

## Review Focus

- Each control reached by Tab shows a rounded ring, in Chromium and Firefox, the wide header's Switch to… and Leave included (spec, Cases). By hand.
- The lobby's tabs: square rings, and the current tab's bar straight at rest. By hand.
- Copy link, a deck card and a room row keep their corners at rest. By hand.
- A control clicked with the mouse still shows no ring. By hand.

---

### Task 0: Commit the docs

- [ ] **Step 1:** Commit the spec, the parent's change and this plan with Task 0's first subject.
- [ ] **Step 2:** After the hand check found the wide header's controls, commit the spec's, the parent's and this plan's amendment with Task 0's second subject.

### Task 1: The controls' radius

Judged by the existing cases unchanged and the hand check (spec, Cases).

**Files:**
- Modify: `frontend/src/page.css`, `frontend/src/components/lobby-tabs.css`, `docs/design/ui-reference.md`, `docs/known-issues.md`

**Interfaces:** none; no component, prop or case changes.

- [ ] **Step 1: The rules (R1, R2).** Add `page.css`'s rule and the tabs' opt-out (Global Constraints).
- [ ] **Step 2: Run the checks and the cases (R4).** Expected: PASS, no case edited.
- [ ] **Step 3: J9's Corners.** In `docs/design/ui-reference.md`, the Corners bullet becomes:

```markdown
- **Corners** are rounded (3b1's second look): panels and messages take
  `--radius`, cards, rows and inputs `--radius-card`, buttons and links
  `--radius-control` unless their component sets its own, the lobby's tabs
  square; the tokens hold the rest.
```

- [ ] **Step 4: The log.** In the same file, after the **4c2-bootstrap.** log entry, add:

```markdown
- **4c2-focus-ring.** Buttons and links (the UI refresh design's step
  4c2-focus-ring) take `--radius-control` by default, from `page.css` in the
  `base` layer, so every control's focus ring is rounded and a component's own
  radius wins. The lobby's tabs opt out, as a radius would curve the current
  tab's bar; the `h1`s a Dismiss focuses stay square, J9 rounding controls,
  not headings. Ruled by the project's owner; the designer validates it on the
  deployed app. Set aside: the radius per component, a list a new control
  must remember to join; a shared class in the markup; waiting for the
  designer's ruling.
```

- [ ] **Step 5: The known issue.** In `docs/known-issues.md`, delete the section "The focus ring is square on quiet buttons, rounded on the others", from its heading through its Resolution and the blank line after it.
- [ ] **Step 6: Commit** the four files with Task 1's subject.
