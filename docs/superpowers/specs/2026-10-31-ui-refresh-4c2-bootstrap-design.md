# UI Refresh, Step 4c2-bootstrap: Bootstrap Removed

Date: 2026-10-31
Status: Approved
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4

## Purpose

4c2-banners left a page where no element carries `legacy-page` or a Bootstrap
class (its Purpose). Bootstrap still sits in the `legacy` layer, and since
4c1-foundation set aside putting the reset above it (its decision 3), its base
rules still decide every property our CSS leaves unset. This step removes
Bootstrap and what only existed because of it, and keeps the two of those
properties a phone shows. Nothing visible changes elsewhere.

## Terms

The parent's Terms hold.

- **The style check**: a throwaway probe hooked into the fixtures' `guard`
  for one run of the full suite, in both browsers. On every page change it
  reads each element's computed style, deletes the `legacy` layer block (and
  `bootstrap-undo.css`'s rules) through the CSSOM, reads again, restores, and
  logs every difference; it also lists `legacy` rules with a state
  pseudo-class (`:hover`, `:focus`, `:disabled`…) whose element matches. The
  style check ran once, on 4c2-banners' tip (#478), and is not committed.
- **The accepted list**: what the style check found beyond the
  two phone properties, each unseen for the reason Accepted costs gives.

## Decisions

1. **Bootstrap goes whole.** Its dependency (the root `package.json`, and in
   the lockfile its peers `jquery` and `popper.js`, which nothing else
   needs, checked), its Dependabot ignore entry with its comment (the
   TypeScript entry stays), its import (into
   `legacy`), `frontend/src/bootstrap-undo.css` and its import, and the
   `.legacy-page` fence with its comment. `base.css` keeps `base` as its one
   layer, the reset and `page.css` beneath our unlayered CSS; the order
   statement goes, as one layer has no order (my call), and `base.css`'s
   header comment is rewritten to say what `base` holds. Bootstrap reaches
   the page only through that import: no Bootstrap JS, no Bootstrap class in
   `frontend/src`, and the server's one page, `probe.html`, loads none
   (checked). 4c1-foundation decision 3's limit on
   `base` (one class's specificity at most, `:where()` otherwise) existed
   for the fence and ends with it: unlayered CSS beats `base` at any
   specificity.
2. **Bootstrap's two phone properties move to `page.css`, on `html`**
   (product owner's ruling): `-webkit-tap-highlight-color: transparent` and
   `-webkit-text-size-adjust: 100%`, equal to what Bootstrap 4.6 sets on
   `html`.
   Without the first, a tap flashes grey in Chromium and Safari; without the
   second, iOS Safari can enlarge text in landscape. Today's page shows
   neither, and the step changes nothing visible. The built CSS holds both
   `-webkit-` declarations literally (checked in a Vite build, as
   4c1-foundation checked its layer order); today's build carries Bootstrap's
   the same way. Set aside: dropping either;
   tap feedback through `:active` styles, which the page has none of, a
   design question for the designer and not this step's.

## States and events

No state changes: the step edits stylesheets and a dependency, and no
component, event or timer.

## Accepted costs

The accepted list, each unseen:

- **Button outline width** goes from 0 to 3 px on a button focused by a
  click: Bootstrap's `button:focus:not(:focus-visible) { outline: 0 }` and
  `[tabindex="-1"]:focus:not(:focus-visible) { outline: 0 !important }` set
  the width, but `outline-style` stays `none`, and our rings are
  `:focus-visible` only (`page.css`). The two `h1`s with `tabIndex={-1}`
  the same.
- **The lobby's `legend`** (`.lobby-form-label`) shrinks from the column's
  width to its text's, losing Bootstrap's `width: 100%`. It has no
  background, border or centring, so its box is not seen; wrapping is capped
  at the column either way.
- **`hr.roster-separator`**'s `overflow` turns `hidden`, which an empty
  element cannot show; its height differs only at widths where it is hidden.
- **SVGs** lose `vertical-align: middle`, which the reset's `display: block`
  makes inert.
- **Buttons' `appearance`** goes from `button` to `auto`, which render alike
  on a `<button>` (inferred, CSS UI 4's compat keyword).
- **Bootstrap's `[hidden] { display: none !important }`** goes, leaving the
  browser's `[hidden]` rule, which any author `display` beats. Our CSS sets
  no `display` on a `hidden` element (`Deck`'s note is the one), so nothing
  shows. Frameworks keep the guard for utility classes that set `display`
  anywhere; ours are component classes. A step that adds such utilities, or
  styles that note, adds the guard. Set aside: keeping it now in `page.css`.
- **`<html>`'s `font-family` and `line-height`**, which nothing inherits,
  as `body` sets both; **`text-align`** from `left` to `start`, alike in
  left-to-right text.

Found matching but already overridden, so not differences: `cursor: pointer`
on enabled buttons (`page.css` sets it on every button), `a:hover`'s colour
and underline (our layers set both on every link), and Bootstrap's custom
properties (our CSS reads none).

## Contract

Nothing changes: no case reads `legacy-page`, a Bootstrap class or a
Bootstrap property.

## Cases

Judged by the existing cases unchanged, in both browsers. No new case: the
two phone properties are seen only on a phone, and a computed-style case
would guard only a deleted line. Set aside: that case.

Decision 2 is judged by its build check: no case reads the declarations, and the style
check is not rerun, since the declarations equal Bootstrap's. Set aside:
adding them in a commit of their own and rerunning the style check on it,
which can only confirm that equal declarations compute alike. No phone hand
test: the phone receives Bootstrap's own declarations, and the build check
covers their reaching it.

## The docs' changes

- **Parent**: the step 4 paragraph's 4c2-bootstrap names this document's
  path, also names the `legacy` layer and the `.legacy-page` fence among
  what goes, and "decides whether to keep Bootstrap's tap highlight removal
  (…)" becomes keeping Bootstrap's two phone properties (decision 2).
- **`docs/design/ui-reference.md`**: the log gains a 4c2-bootstrap entry
  after 4c2-banners', in its shape, for decision 2 and its set-asides.
- Bootstrap's other mentions in the parent and `ui-reference.md` record
  history or set-asides and stay; 4c1-foundation's and the earlier specs,
  delivered, stay as written.

## Branches and commits

One PR on `20260930.ui_refresh_4c2_bootstrap`, stacked on 4c2-banners'
`20260930.ui_refresh_4c2_banners` (#478): this document, the parent's change
and its plan first; then Bootstrap removed, decision 2's declarations in
`page.css` and the docs' changes, judged by the existing cases unchanged and
decision 2's build check.
