# UI Refresh, Step 4c2-focus-ring: The Controls' Rounded Ring

Date: 2026-10-31
Status: Approved
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4

## Purpose

The focus ring is an `outline`, which follows its element's corners. J9's
Corners give buttons `--radius-control`, but only `.button` sets it, so the
quiet buttons and the wide header's link-styled Switch to… and Leave get a
square ring (the known issue 4c2-bootstrap recorded). This step makes rounded
corners the controls' default.

## Decisions

1. `page.css` gives `button, a` `border-radius: var(--radius-control)`,
   beside `:focus-visible`. It sits in the `base` layer, so a component's own
   radius wins whatever its specificity (deck cards, room rows and Copy link
   keep `--radius-card`). Every `button` and `a` with a border or background
   already sets its own, so only rings change. Ruled by the project's owner
   on 2026-10-31; the designer validates it on the deployed app. Set aside:
   the radius on `.button-quiet` and the header's two controls, a list a new
   control must remember to join; a shared class in the markup, the same list
   moved into every component; waiting for the designer's ruling.
2. The lobby's tabs opt out, `border-radius: 0` on `.lobby-tabs a`: the
   current tab's bar is a bottom border, which a radius would curve. The
   `h1`s a Dismiss focuses keep a square ring too, being neither `button` nor
   `a`: J9 rounds controls, not headings. Set aside: rounding every focus
   target.

## Accepted costs

A link inside running text, if one is added, takes a rounded ring, rounded on
each line when it wraps. None exists today.

## Cases

Judged by the existing cases unchanged, in both browsers. No new case: a
computed-style case would only restate the rule. A hand check in Chromium and
Firefox, by Tab: Dismiss, Use theirs, Edit, Clear votes, Switch to… and Leave
in both the wide header and the narrow one's menu, and the menu button, each
ring rounded; the lobby's tabs square, the current tab's bar straight; Copy
link, a deck card and a room row with their corners unchanged.

## The docs' changes

- **Parent**: the step 4 paragraph names 4c2-focus-ring and this document.
- **`docs/design/ui-reference.md`**: J9's Corners give buttons and links
  `--radius-control` unless their component sets its own, the lobby's tabs
  square; the log gains a 4c2-focus-ring entry after 4c2-bootstrap's.
- **`docs/known-issues.md`**: the square ring's entry is removed.

## Branches and commits

One PR on `20260930.ui_refresh_4c2_focus_ring`, stacked on 4c2-bootstrap's
`20260930.ui_refresh_4c2_bootstrap` (#479): this document, the parent's change
and the plan first, then their amendment for decisions 1 and 2; then the rules
and the other docs' changes in one commit.
