# UI Refresh, Step 4c2-focus-ring: The Quiet Buttons' Rounded Ring

Date: 2026-10-31
Status: Approved
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4

## Purpose

The focus ring is an `outline`, which follows its element's corners. J9's
Corners give buttons `--radius-control`; `.button` sets it, `.button-quiet`
never did, so a quiet button's ring is square (the known issue 4c2-bootstrap
recorded). This step gives the quiet buttons that radius.

## Decisions

1. `.button-quiet` takes `border-radius: var(--radius-control)`. A quiet
   button has no border and no background, so only its ring changes. Ruled by
   the project's owner on 2026-10-31; the designer validates it on the
   deployed app. Set aside: waiting for the designer's ruling before the
   change.
2. The `h1`s a Dismiss focuses keep a square ring: J9 rounds controls, not
   headings. Set aside: rounding every focus target.

## Cases

Judged by the existing cases unchanged, in both browsers. No new case: a
computed-style case would only restate the line. A hand check in Chromium and
Firefox: Tab onto Dismiss, Use theirs, Edit, Clear votes, the header's menu
button, Switch to… and Leave; each ring is rounded and nothing else moves.

## The docs' changes

- **Parent**: the step 4 paragraph names 4c2-focus-ring and this document.
- **`docs/design/ui-reference.md`**: J9's Corners say quiet buttons included;
  the log gains a 4c2-focus-ring entry after 4c2-bootstrap's.
- **`docs/known-issues.md`**: the square ring's entry is removed.

## Branches and commits

One PR on `20260930.ui_refresh_4c2_focus_ring`, stacked on 4c2-bootstrap's
`20260930.ui_refresh_4c2_bootstrap` (#479): this document, the parent's change
and the plan first; then the rule and the other docs' changes in one commit.
