# UI Refresh Step 4c1-mockups: The Mockups' CSS Moved into the App, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename both mockups' classes to one convention, move all of their CSS into stylesheets under `frontend/src/`, have the mockups link those files, and leave the app's build unchanged.

**Architecture:**
- `frontend/src/page.css` holds the element rules both mockups open with, merged.
- `frontend/src/components/` holds `looks.css` (the shared looks), the frames `room-page.css` and `lobby-page.css`, and one area file per class prefix.
- Each mockup's `<style>` imports `reset.css` and `page.css` into `layer(base)` and keeps only its own parts. Its links name `colours.css`, `tokens.css`, `looks.css`, then its area files.
- Nothing in the app imports the new files. The gate's `literalProblems` already reads every stylesheet under `frontend/src/`.

**Tech Stack:** Plain CSS (cascade layers, container queries); the mockups' inline scripts; Playwright 1.63 for the scratch diff and checks; Vitest for the gate.

**Spec:** `docs/superpowers/specs/2026-10-21-ui-refresh-4c1-mockups-design.md` (approved 2026-10-22). It builds on `docs/superpowers/specs/2026-10-21-ui-refresh-4c1-foundation-design.md` (PR #458), whose decisions 3, 4, 5 and 9 it cites.

## How this plan was verified

- **Probed, 2026-10-22, in Chromium and Firefox:**
  - From `file://`, a `<style>` holding `@import url(../../frontend/src/x.css) layer(base);` applies that parent directory's file.
  - An unlayered `<link>`ed rule beats it.
- **Checked:**
  - None of this plan's class names is a class in Bootstrap 4.6.2's stylesheet.
  - The new names' prefixes are not Bootstrap prefixes either.
- **Read, not run:** the specificity notes below are reasoned from the mockups' CSS. The diff in Tasks 1 and 2 is the judge.

## Rulings this plan makes, for the user's review

- **R1. The move lands in two commits, the renaming and then the move.**
  - The renaming is done in place, in each mockup's own `<style>`, and is judged to change no computed style.
  - Its diff is then the readable record of the names that decision 1 asks for.
  - The move then changes only where the rules live, the merges and the expected differences.
  - The spec's "Branches and commits" names one commit for the move.
- **R2. The shared looks extend the spec's list within its prefixes:**
  - `button-secondary`, `button-outline`, `button-quiet`, `button-word`;
  - `panel-label`;
  - `message`, `message-problem`;
  - `brand-logo-name`.
  - One new shared look: `tight-point`, the point in "0.5", which every area showing a value uses.
- **R3. A rule lives in the file of the first class in its selector.** A selector list that spans files is split, one rule per file, each inside the same `@media` and `@container` wrappers. For example, `.round-bar .button` lives in `round-bar.css`, and `.lobby-page-inert .button:disabled` lives in `lobby-page.css`.
- **R4. Where the two mockups drew a shared look differently, it converges to the room's version** (the user's ruling, 2026-10-22, for one look across the pages). The table in Task 2 gives the details:
  - the lobby's panel takes the room's hairline and padding;
  - the lobby's Dismiss joins `button-quiet`;
  - in forced colours, the lobby's mark takes the room's rule;
  - the lobby's `.btn + .btn` is dropped, as no lobby page draws two adjacent buttons (checked: each of its templates draws one).

  The button is the one split, since the two pages' buttons do different jobs. The common declarations go in `looks.css`, and each page's own part stays with that page at higher specificity. The convergences go to the product owner as expected differences.
- **R5. "The parameter switches" are the design alternatives behind a parameter:**
  - `brand=pip`'s mark;
  - `rejoin=chip`'s outlined arrow.

  Their rules stay in the mockup, renamed, like the `later=1` parts. The probe has no rule; its inline style stays in its script.
- **R6. A state with an ARIA attribute in today's app is styled through that attribute.**
  - Only state attributes count: `aria-pressed`, `aria-disabled`, `aria-current` and `aria-expanded`.
  - So the confirmed card becomes `.deck-card[aria-pressed="true"]`.
  - The kept card stays a class, `deck-card-kept`, as `aria-describedby` is a relation, not a state.
- **R7. Each moved comment keeps its words, but a bare "decision N" gains the step whose spec it cites,** such as "(3b1 decision 4)". In `room.html` that is 3b1, except in the block that opens "3b3:". In `lobby.html` it is 3b4.
- **R8. The cells pages keep their own `<style>`.** It frames the cells in `px` and hex and is not the design.
- **R9. The Google Fonts link keeps its families and weights; only `display=block` becomes `display=swap`.**

## Global Constraints

**Branch and commits:**
- Branch `20260930.ui_refresh_4c1_mockups`, stacked on `20260930.ui_refresh_4c1_foundation` (#458). Its spec commits already exist.
- New commits only: no amend, rebase or force-push. Nothing is pushed until the user asks.
- Commit subjects, verbatim, in Conventional Commits:
  - Task 0: `docs: plan moving the mockups' CSS into the app (ui refresh step 4c1-mockups)`
  - Task 1: `docs: rename the mockups' classes to one convention (ui refresh step 4c1-mockups)`
  - Task 2: `feat: move the mockups' CSS into the app's stylesheets (ui refresh step 4c1-mockups)`
  - Task 3, only if a ruling changes a file: `fix: apply the product owner's rulings on the mockups' diff (ui refresh step 4c1-mockups)`
- No "Generated with Claude Code" or co-author line.

**CSS:**
- The new files follow `base.css`'s layout: one selector per line in a list, and one declaration per line.
- No nesting syntax. The mockups' descendant selectors are kept.
- Values are copied unchanged, except decision 5's weight.
- No `px` and no literal colour, so the gate passes. System colours, `transparent` and `currentColor` are fine.
- Comments are one or two lines, with no em dash.
- `looks.css` opens with a comment saying it comes before the area files, which override it at equal specificity.

**The mockups:**
- They must still open from a checkout through `file://`, without `npm install`.
- The page's structure does not change: no element is added, removed or moved. Templates change only their `class` values, the ARIA swap in R6, and the `<main>`, `<h1>`, `<label>`, `<legend>`, `<fieldset>` and radio `<input>` elements that take a class.
- The scripts' selectors follow the renaming.

**Running:**
- `$W` is a scratch directory outside the repo, such as the session's scratchpad.
- The "before" tree is `git archive a830e04 docs/design frontend/src | tar -x -C "$W/before"`. Here a830e04 is the branch's tip before this plan, with the mockups as 3b4 left them.

**Writing:**
- Cite symbols, case titles and PR numbers, never line numbers.
- No counts of commits, edits, items or lines in docs.
- The spec's Status line stays as it is.

## Review Focus

The diff covers each parameter alone, the default hovers and focuses, and three clicks. These go to the final reviewer:

1. **The keyboard handlers in `room.html`:** Escape on ☰'s row, the repeated Enter in the round bar, and the Firefox focus scroll above the pinned sheet. Their selectors are renamed, and only a thrown error or a wrong look would show it. Each should behave as before.
2. **Firefox ESR 140 opening a mockup from a checkout:** the script fit of the editor's field, and `@import … layer()`. Task 2's Firefox check reads one default page each.
3. **Equal-specificity order across files:** 4c1-wide will import the files in its own order. Every rule that wins only by coming later should be one that `looks.css`-first decides, such as the room header's ☰ row over `panel`.
4. **States reached only by combining parameters,** such as a facilitator on the phone with the menu open. Every rule should still match there.

---

### Task 0: Commit the plan

- [ ] **Step 1: Commit**

```bash
git add docs/superpowers/plans/2026-10-22-ui-refresh-4c1-mockups.md
git commit -m "docs: plan moving the mockups' CSS into the app (ui refresh step 4c1-mockups)"
```

### Task 1: The diff, then the renaming in place

**Files:**
- Create (scratch, not committed): `$W/mockdiff.mjs`
- Modify: `docs/design/room.html`, `docs/design/lobby.html`

**Interfaces:**
- Produces:
  - **`node $W/mockdiff.mjs <beforeDir> <afterDir> [--with-other]`.** Each directory holds `docs/design/` and `frontend/src/`. It prints one line per difference, `<count> <page> <tag>.<classes after> <property>: <before> → <after>`. Before those it prints `unpaired <page> <state> <path>` for any element without a pair, and `error <page> <state> <message>` for any page error or console error, on either side.
  - **The names below,** which Task 2's files use.

- [ ] **Step 1: Write `$W/mockdiff.mjs`**

The setup:
- It runs in Chromium. It opens `file://<dir>/docs/design/{room,lobby}.html?<params>` on each side.
- It aborts every request to `fonts.googleapis.com` and `fonts.gstatic.com`, so both sides draw the fallback.

Before each snapshot, it waits for `document.fonts.ready`, every `document.getAnimations()` to finish, and two frames.

A snapshot holds `getComputedStyle` of every element from `document.documentElement` down, custom properties skipped:
- Each element is keyed by its path of `localName:index`.
- Each element's `::before` and `::after` are included unless their `content` is `none` or `normal`.

Before and after are paired by state and path, and the differences tallied.

The states:

| Page | Widths × height | Parameter sets (each from the defaults) |
|---|---|---|
| room | 1280, 1000, 800, 392 × 680 | the defaults; every value in `room-cells.html`'s options alone; `role=facilitator` with each `phase`; `me=Carol`; `name0=Al`; `brand=pip`; `probe=1`; `menu=1`; `room=fearless-speckled-flamingo`; `facilitators=1`, `3`, `5` |
| lobby | 1280, 800, 392, 320 × 700 | each of `lobby-cells.html`'s cells, alone and with every value in its options alone; `tab=join`; `role=facilitator`; `typed=x`; `stored=` and `suggestion=` on `page=notaroom`; `room=fearless-speckled-flamingo` on `page=pinned` |

At the defaults, at each width, the script also records:
- each `button` and `a`, hovered by the mouse and focused by `locator.focus()`;
- the page under `emulateMedia({ forcedColors: 'active' })` and under `reducedMotion: 'reduce'`;
- for the room only, after clicking Copy link, after clicking Show votes (the guard), and after clicking the 8 card.

With `--with-other`, the after side of each page also gets the other mockup's area files, as `<link>`s appended to its `head`. It is meant to be run with the same directory on both sides.

- [ ] **Step 2: Prove the diff can fail**

Run: `mkdir -p "$W/before" && git archive a830e04 docs/design frontend/src | tar -x -C "$W/before" && node $W/mockdiff.mjs "$W/before" . > "$W/d0.log"; tail -3 "$W/d0.log"`

Expected: no output lines, as the tree is unchanged.

Then, in the working tree only, change `room.html`'s `.card` `border-radius` to `var(--radius-control)`, run the same command into `$W/d0m.log`, and revert with `git checkout docs/design/room.html`.

Expected: `d0m.log` has `border-*-radius` lines for `button.card`, and nothing else.

- [ ] **Step 3: Rename both mockups' classes in place**

Each mockup keeps its own `<style>` in this task. Rename its selectors, its templates' classes and its script's selectors by the map below.

A modifier on a component becomes `<name>-<state>`, so `mark ${p.state}` becomes `voters-mark voters-mark-${p.state}`.

Where a compound such as `.mark.kept` (0,2,0) becomes one class (0,1,0), it must still beat the same rules. Keep it after them in the same file.

| Owner, its file | Old → new |
|---|---|
| shared, `looks.css` | `.logo` → `brand-logo`; `.app` → `brand-logo-name`; `.btn` → `button`; `.primary` → `button-primary`; `.secondary` → `button-secondary`; lobby `.outline` → `button-outline`; `.quiet` → `button-quiet`; `.word` in a button → `button-word`; `.panel` stays; `.label` → `panel-label`; `.msg` → `message`; `.problem` → `message-problem`; `.notice` → `message-notice`; `.pt` → `tight-point` |
| room frame, `room-page.css` | `.shell` → `room-page`; `.shell-in` → `room-page-stack`; `.main` → `room-page-main`; `.col` → `room-page-column`; `.side` → `room-page-sidebar`; room `.messages` → `room-page-banners` |
| header, `room-header.css` | `.header` → `room-header`; `.is-copied` → `room-header-copied`; `.chip` → `room-header-chip`; `.chip h1` → a class on the `h1`, `room-header-id`; `.chip a` → `room-header-copy`; its `.word` → `room-header-copy-word`; `.copied` → `room-header-copy-note`; `.role` → `room-header-role`; `.leave` → `room-header-leave`; `.menu-btn` → `room-header-menu-button`; `.menu` → `room-header-menu`; `.menu-role` → `room-header-menu-role` |
| issue, `issue-panel.css` | `.issue-panel` stays; `.issue` → `issue-panel-view`; `h2.empty` → `issue-panel-empty`; `.seg` → `issue-panel-seg`; `.issue-status` → `issue-panel-status` |
| editor, `issue-editor.css` | `.issue-edit` → `issue-editor`; `.field` → `issue-editor-field`; `.edit-actions` → `issue-editor-actions` |
| slot, `round-panel.css` | `.round` → `round-panel`; `.slot` → `round-panel-slot` |
| deck, `deck.css` | `.deck` stays; `.card-place` → `deck-place`; `.card` → `deck-card`; `.card.confirmed` → `.deck-card[aria-pressed="true"]` (R6), the class dropped from the template; `.card.kept` → `deck-card-kept`; `.tag` → `deck-tag` |
| result, `result.css` | `.chart` → `result`; `.most` → `result-most`; `.figure` → `result-figure`; `.figure.list` → `result-figure-list`; `.sub` → `result-sub`; `.columns` → `result-columns`; `.colm` → `result-column`; `.top` → `result-column-top`; `.colm.empty` → `result-column-empty`; `.count` → `result-count`; `.bar` → `result-bar`; `.value` → `result-value`; `.sr` → `result-sr` |
| round bar, `round-bar.css` | `.controls` → `round-bar`; `.phase` → `round-bar-phase` |
| voters, `voters.css` | `.people` → `voters`; `.reserve` → `voters-reserve`; `.people-top` → `voters-top`; `.entries` → `voters-entries`; `.mark` → `voters-mark`; `.face` → `voters-face`; their states → `voters-mark-<state>` and `voters-face-<state>`; `.name` → `voters-name`; `.you` → `voters-you`; `.fac-line` → `voters-facilitators` |
| roster, `roster.css` | `.roster` stays; `.row` → `roster-row`; `.me` → `roster-row-me`; `.who` → `roster-who`; `.av` → `roster-avatar`; `.pill` → `roster-pill`, states `roster-pill-<state>`; `.val` → `roster-value`; `.val.none` → `roster-value-none`; `.fac` → `roster-facilitator`; `.sep` → `roster-separator` |
| later steps, stays in `room.html` | `.later` stays; `.progress` → `round-progress`; `.top-progress` → `round-progress-top`; `.big-progress` → `round-progress-big`; `.history` → `round-history`; `.what` → `round-history-issue` |
| brand=pip, stays in `room.html` | `.logo.pip` → `brand-logo-pip` |
| lobby frame, `lobby-page.css` | lobby `.col` → `lobby-page-column`; lobby `.header` → `lobby-page-header`; `main` → a class on `<main>`, `lobby-page-main`; lobby `.messages` → `lobby-page-banners`; lobby `.panel` → `panel lobby-page-panel`; `.inert` → `lobby-page-inert`; `h1` → a class on each `h1`, `lobby-page-title`; `h1 code` → `.lobby-page-title code`; `.lead` → `lobby-page-lead` |
| room row, `room-row.css` | lobby `.row` → `room-row`; `.square` → `room-row-square`; `.text` → `room-row-text`; `.id` → `room-row-id`; `.line2` → `room-row-line2`; `.go` → `room-row-go`; `.go.primary` → `room-row-go-primary` |
| rejoin=chip, stays in `lobby.html` | `.go.chip` → `room-row-go-chip` |
| tabs, `lobby-tabs.css` | `.tabs` → `lobby-tabs` |
| form, `lobby-form.css` | `label, legend` → a class on each, `lobby-form-label`, radio labels included; `.radios` → `lobby-form-radios`; `.input` → `lobby-form-input`; `.input.mono` → `lobby-form-input-mono`; `fieldset` → a class on it, `lobby-form-roles`; `input[type="radio"]` → a class on each, `lobby-form-radio`; `.help` → `lobby-form-help` |

In this task the lobby's own `.panel` rule keeps its name, and its panel element gains `lobby-page-panel`, which scopes the lobby's button part. Task 2 drops the lobby's `.panel` rule (R4).

- [ ] **Step 4: Run the diff**

Run: `node $W/mockdiff.mjs "$W/before" . > "$W/d1.log"; tail -5 "$W/d1.log"`

Expected: no output lines: no difference, no unpaired element and no error. Any line is a specificity or template slip: fix it and run again.

- [ ] **Step 5: Commit**

```bash
git add docs/design/room.html docs/design/lobby.html
git commit -m "docs: rename the mockups' classes to one convention (ui refresh step 4c1-mockups)"
```

### Task 2: The move into the app's files, and the reference

**Files:**
- Create:
  - `frontend/src/page.css`
  - `frontend/src/components/looks.css`, `room-page.css`, `room-header.css`, `issue-panel.css`, `issue-editor.css`, `round-panel.css`, `deck.css`, `result.css`, `round-bar.css`, `voters.css`, `roster.css`, `lobby-page.css`, `room-row.css`, `lobby-tabs.css`, `lobby-form.css`
- Modify: `docs/design/room.html`, `docs/design/lobby.html`, `docs/design/ui-reference.md`
- Test: the gate's `keeps literal colours and px out of %s` rows in `frontend/src/design/tokens.gate.test.ts`, unchanged

**Interfaces:**
- Consumes: Task 1's names and `$W/mockdiff.mjs`.
- Produces: the files above, which 4c1-wide, 4c1-narrow, 4c1-editor and 4c2 import, `looks.css` before the area files.

- [ ] **Step 1: Build the app as it is, for the comparison at the end**

Run: `npm run build > "$W/b0.log" 2>&1 && ls frontend/dist/assets > "$W/assets-before.txt" && cp frontend/dist/index.html "$W/index-before.html"`

Expected: the build succeeds.

- [ ] **Step 2: Write `page.css`**

Its content is decision 3's rules with both mockups' values: `*`, `html`, `body`, `a { color: var(--ink) }`, `button, input { font: inherit; color: inherit }`, `button { cursor: pointer }`, `svg` and `:focus-visible`. It keeps the room's comment on the scrollbar's gutter. It opens with a comment saying that it goes into the `base` layer after the reset (4c1-mockups decision 3).

- [ ] **Step 3: Write the area files and `looks.css`**

Move every rule out of the mockups' `<style>`s into the file R3 names, in its original order within that file. Where both mockups had the same rule, it is written once.

Where the two pages drew a shared look differently (R4):

| Look | `looks.css` | The page's own rule |
|---|---|---|
| `panel` | the room's rule | none: the lobby's `.panel` rule is dropped |
| `button` | `min-height`, `padding-inline: var(--space-4)`, `border`, `border-radius`, `font-weight`, `align-items: center`, `justify-content: center`; `.button svg { display: none }` | `.round-bar .button { display: inline-flex; gap: var(--space-2); min-width: var(--action-width); padding-block: 0 }`; `padding-block: 0` added to `.issue-editor-actions .button`; `.lobby-page-panel .button { display: flex; width: 100%; text-decoration: none; cursor: pointer }` |
| `button + button` | none | none: dropped, as it matches nothing |
| `message .button-quiet` | the room's `.msg .quiet`, over the room's `.quiet` | none: the lobby's Dismiss gains `button-quiet` |
| `brand-logo` in forced colours | the room's rule | none |

`.lobby-form-input-mono` gains `font-weight: var(--weight-medium)` (decision 5).

- [ ] **Step 4: Point the mockups at the files**

Each mockup's head, in this order:
1. its `colours.css` and `tokens.css` links;
2. its `<style>`;
3. `looks.css`, then its area files: `room-page`, `room-header`, `issue-panel`, `issue-editor`, `round-panel`, `deck`, `result`, `round-bar`, `voters` and `roster` for the room, and `lobby-page`, `room-row`, `lobby-tabs` and `lobby-form` for the lobby;
4. the Google Fonts link, with `display=swap`.

The `<style>` comes before `looks.css` so that `.later`'s radius still loses to the panel's and the button's by source order, as it did.

The `<style>` opens with these two lines, verbatim. It then holds only R5's rules and the rules that match nothing but what `later=1` adds:
```css
@import url(../../frontend/src/reset.css) layer(base);
@import url(../../frontend/src/page.css) layer(base);
```

- [ ] **Step 5: Run the diff against the original mockups**

Run: `node $W/mockdiff.mjs "$W/before" . > "$W/d2.log"; grep -c . "$W/d2.log"; grep -E '^(unpaired|error)' "$W/d2.log"`

Expected: no `unpaired` and no `error` lines. Every difference falls under one of these causes:
- the reset, which the mockups did not load before: its properties are `box-sizing`, `margin-*`, `line-height`, `max-width` and `display` on `svg`, the `font-*` of form controls, `overflow-wrap`, `text-wrap-*`, `isolation` on `#root` and `interpolate-size`, plus the sizes and positions they move;
- the room's ☰ row Leave, its `color` from the browser's link blue to ink (decision 3);
- the lobby's buttons taking `cursor: pointer` (decision 3);
- the lobby's Room id field, its `font-weight` 400 → 500 (decision 5);
- the lobby's panel, its hairline border and the room's padding, with the sizes and positions they move (R4);
- the lobby's Dismiss, its `font-size` and gap from `button-quiet` (R4);
- the lobby's mark in forced colours, its `box-shadow` and `border-color` (R4).

Any other line is a slip in the move: fix it and run again.

- [ ] **Step 6: Run the diff with each page carrying the other's files**

Run: `node $W/mockdiff.mjs . . --with-other > "$W/d3.log"; tail -3 "$W/d3.log"`

Expected: no output lines. This is decision 1's "removes every collision": in one bundle, no rule of either page reaches the other.

- [ ] **Step 7: Check that each mockup opens in Firefox**

Write `$W/ffopen.mjs`. It opens each mockup at its defaults through `file://` in Firefox, plus `room.html?edit=1`, and prints these values with any page error:
- `getComputedStyle(#root).isolation`, from the reset through `@import`;
- `getComputedStyle(html).scrollbarGutter`, from `page.css`;
- `.deck-card`'s `aspect-ratio` on the room and `.room-row`'s `display` on the lobby, from the area files;
- `.issue-editor-field`'s inline `height`, from the script fit, when `field-sizing` is unsupported.

Run: `node $W/ffopen.mjs`

Expected: `isolate`, `stable`, `5 / 7` and `flex`, with no page error.

- [ ] **Step 8: Prove the gate reads the new files**

Run: `npm run test:unit > "$W/u2.log" 2>&1; grep -E "components/(deck|looks)\.css|page\.css|Tests" "$W/u2.log"`

Expected: every test passes, including a `keeps literal colours and px out of` row for `page.css` and for each file in `components/`.

Then add `outline-width: 1px;` to `.deck-card` in `deck.css` and run again.

Expected: `keeps literal colours and px out of components/deck.css` fails with `a px in outline-width: 1px`. Revert.

- [ ] **Step 9: Update the reference's Mockups section**

Replace its first bullet with this one. Leave the rest of the section as it is.

```markdown
- They live beside this file, under `docs/design/`, as clickable HTML linking
  the app's stylesheets: the value source, `looks.css` and their area files in
  `frontend/src/components/`, with `reset.css` and `page.css` imported into the
  `base` layer. Their own `<style>` keeps only the later steps' parts and the
  parameters' design alternatives.
```

- [ ] **Step 10: Check that the app's build is unchanged**

Run: `npm run build > "$W/b2.log" 2>&1 && ls frontend/dist/assets | diff "$W/assets-before.txt" - && diff "$W/index-before.html" frontend/dist/index.html && echo same`

Expected: `same`. The hashed asset names are equal, so no byte of the app's CSS or JS changed.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/page.css frontend/src/components/*.css docs/design/room.html docs/design/lobby.html docs/design/ui-reference.md
git commit -m "feat: move the mockups' CSS into the app's stylesheets (ui refresh step 4c1-mockups)"
```

### Task 3: The product owner's rulings, then the suite

**Files:**
- Modify, only as a ruling asks: the files of Task 2

**Interfaces:**
- Consumes: `$W/d2.log`.

- [ ] **Step 1: Bring `d2.log` to the product owner**

Group its lines by cause: Task 2 Step 5's list, and within the reset by property. For each group, give the elements and states it reaches and whether it shows on screen, with a screenshot pair where it does.

The product owner rules each group: it moves, or the move is fixed. This step waits for those rulings.

- [ ] **Step 2: Apply each "fix" ruling**

Each fix is made in the area file that owns the rule, as a declaration that keeps the earlier value. For example, `text-wrap: wrap` on the issue's heading would undo the reset's `balance` there.

Run: `node $W/mockdiff.mjs "$W/before" . > "$W/d4.log"`

Expected: the fixed group's lines are gone, and nothing new appears. Then repeat Task 2's Steps 6, 8 and 10.

- [ ] **Step 3: Run the whole suite**

Run: `npm run pree2e > "$W/pre.log" 2>&1 && npx playwright test > "$W/e2e.log" 2>&1; tail -5 "$W/e2e.log"; npm run test:unit && npm run typecheck && npm run lint`

Expected: every e2e case passes in both browsers, unchanged; the unit tests pass; and typecheck and lint print nothing.

- [ ] **Step 4: Commit, if Step 2 changed a file**

```bash
git add frontend/src/components/*.css frontend/src/page.css docs/design/room.html docs/design/lobby.html
git commit -m "fix: apply the product owner's rulings on the mockups' diff (ui refresh step 4c1-mockups)"
```
