# UI Refresh Step 3b2: Narrow and Large Screens, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the value source 3b2's tokens, port the settled scratch mockup into `docs/design/room.html`, and give the design reference the narrow and large room page.

**Architecture:**
- Three commits after the spec's, in the order its "Branches and commits" gives:
  1. the tokens and the gate (Task 1), judged by the unit tests;
  2. the mockup (Task 2), judged by the product owner, and proven equal to the scratch mockup he already judged;
  3. the reference and the docs that point to it (Task 3).
- The scratch mockup `docs/design/room-3b2-final.html` (untracked) draws every settled decision behind URL switches whose defaults are the settled options. Task 2 copies it over `room.html`, deletes the other options, and moves its values to tokens. A script then compares the two pages element by element: the port must draw the same boxes before any fix is made.
- The checks (`~/Documents/pointing-poker-3b2/scripts/`) were dry-run on the scratch mockup on 2026-10-16. They fail there exactly where the port must differ (Task 2, Step 7), so each can fail.

**Tech Stack:** TypeScript, Vitest (`npm run test:unit`), postcss and postcss-value-parser (the gate); static HTML, CSS and JavaScript (the mockup); Playwright's Chromium and Firefox from the repo's `node_modules/playwright`.

**Spec:** `docs/superpowers/specs/2026-10-15-ui-refresh-3b2-narrow-and-large-design.md`. Read it first: its Terms (wide layout, phone layout, compact foot, top line, sheet), its decisions 1 to 15 and its Disclosure table are what this plan carries out. The full record of the options, with what was rejected, is `~/Documents/pointing-poker-3b2/DECISIONS.md` and `REVIEW-WAVE-1.md`, outside the repo.

## Rulings this plan makes, for the user's review

- **R1. Two least heights.** The spec names one token, `--result-least`. The settled mockup needs two values: 13 rem in the phone layout, where the result needs 11.75 rem, and 11.5 rem in the wide layout's compact foot, where it needs about 10 rem (measured 2026-10-16). One value would either spill the phone's result or take 1.5 rem from the wide layout's table on short windows. The plan adds `--result-least: 11.5rem` and `--result-least-narrow: 13rem`, named like `--entry-scale-narrow`, and Task 1 amends the spec's two mentions.
- **R2. Two scratch bugs fixed in the port.** Both are caught by checks that fail on the scratch mockup.
  - The phone header's Copy link has a 30 by 44 px hit area, not decision 8's 44 by 44.
  - Where the sheet flows (below 39 rem tall), the kept tag lands at the page's top, since nothing positions the round panel.
- **R3. The later progress's overlap goes to the progress step** (the user chose it on 2026-10-16, over 8 px more top line now). The drawn progress, "10 of 14 voted" at the top line's left, overlaps a lifted card in the first row at 392 px (0.5 chosen) and at 900 px. Giving the top line the lift's room costs 8 px of sheet and table everywhere in the compact foot. The plan records it as a constraint on the progress step in decision 15 and draws nothing more.
- **R4. `room-cells.html` gains a width switch** (1280, 1000, 800, 392) and two heights (900, 743), so the product owner sees both switches without resizing.

## Global Constraints

**Branch and commits:**
- Branch `20260930.ui_refresh_3b2_narrow_and_large`, on top of `b3ed794`. New commits only: no amend, rebase or force-push. Nothing is pushed until the user asks.
- Commit subjects, verbatim, in Conventional Commits:
  - Task 0: `docs: plan the narrow and large room page (ui refresh step 3b2)`
  - Task 1: `feat: add the narrow and large room page's tokens (ui refresh step 3b2)`
  - Task 2: `docs: give the room page mockup its phone layout and width cap (ui refresh step 3b2)`
  - Task 3: `docs: give the design reference the narrow and large room page (ui refresh step 3b2)`
- No "Generated with Claude Code" or co-author line.

**Values, verbatim from the spec:**
- The structure switch: `51.75rem`. The foot switch: `65.75rem`. The deck's 7-and-6 rows: from a `22.25rem` deck. The pin: `(min-height: 39rem)`.
- `--page-max` `106rem`, `--entry-scale-narrow` `0.8`, `--sheet-clearance` `24rem`, `--deck-width` `100cqi`; R1's `--result-least` `11.5rem` and `--result-least-narrow` `13rem`.
- Names kept: "Copy link", "Menu", "Clear votes", "Edit issue".

**Writing:**
- Code and CSS comments are one or two lines.
- Cite symbols and section names, never line numbers; in docs, a PR number or a main commit, never a branch hash.
- No counts of commits, edits, items or lines in docs.
- The 3b2 spec and the parent's open steps may be edited; the 3b1 spec's only change is its status line, already made.
- Subagents run on Opus, Sonnet or Haiku, never Fable.
- Scripts run from the repository root.

## Review Focus

1. **A resize across a switch keeps a script's state.** The table's fitted scale and ☰'s open row are set by script, so crossing 51.75 rem by a drag must give what a load at that width gives. Task 2, Step 7 (checks 2 and 7).
2. **Something placed against the sheet where the sheet flows.** Below 39 rem tall the sheet is static, so the kept tag and the drawn progress need an anchor that is not the sticky position. Task 2, Step 7 (check 3).
3. **Focus under the pinned sheet in Firefox as well as Chromium**, and the clearance leaking into the wide layout or a flowing sheet. Task 2, Step 7 (check 6).
4. **The phone header with the longest room id**: Copy link's hit area and ☰'s row at 44 px, "Link copied" moving nothing. Task 2, Step 7 (checks 5 and 9).
5. **The cap on a large screen**: the page centred at 106 rem, the header's content aligned with the page's. Task 2, Steps 5 and 7 (the oracle at 2560 by 1440, check 8).

---

### Task 0: Commit this plan

- [ ] **Step 1:** after the user's review, commit only this file.

```bash
git add docs/superpowers/plans/2026-10-16-ui-refresh-3b2-narrow-and-large.md
git commit -m "docs: plan the narrow and large room page (ui refresh step 3b2)"
```

### Task 1: The tokens and the gate

**Files:**
- Modify: `frontend/src/design/gate.ts` (`unitOnlyOn`)
- Modify: `frontend/src/tokens.css`
- Modify: `docs/superpowers/specs/2026-10-15-ui-refresh-3b2-narrow-and-large-design.md` (R1)
- Test: `frontend/src/design/gate.test.ts`, `frontend/src/design/tokens.gate.test.ts` (unchanged, it reads the real files)

**Interfaces:**
- Consumes: nothing new.
- Produces, for Task 2: the six tokens under the names in Global Constraints; the gate allowing `cqi` on `--value-fit` and `--deck-width` only.

- [ ] **Step 1: Write the failing unit test.** In `gate.test.ts`, describe `'what tokens.css may hold'`, replace the test `'allows ms, no unit, em on the label tracking and the tight point, cqi on the value fit, dvh on the shell'` with:

```ts
  it('allows ms, no unit, em on the label tracking and the tight point, cqi on the value fit and the deck width, dvh on the shell', () => {
    const fine = '--tracking-label: 0.06em; --tight-point: -0.08em; --value-fit: 66cqi; --deck-width: 100cqi; --b: 180ms; --c: 1.5;'
    expect(problems(`${fine} --d: var(--text-2xl); --shell-height: 100dvh;`)).toEqual([])
  })
```

The `it.each` row `['--a: 66cqi;', '--a: the unit cqi in 66cqi']` stays: `cqi` on any other token still fails.

- [ ] **Step 2: Run it to see it fail.**

Run: `npx vitest run --root frontend src/design/gate.test.ts`
Expected: 1 failed, the test above, with `['--deck-width: the unit cqi in 100cqi']`.

- [ ] **Step 3: Add the tokens.** In `frontend/src/tokens.css`'s `:root` block:
  - after `--sidebar`:

```css
  --page-max: 106rem; /* the page's width cap, a 1080p monitor's page, above the 65.75 rem switch (3b2 decision 13) */
  --sheet-clearance: 24rem; /* focus's clearance above the phone's pinned sheet, at most 23.75 rem tall (3b2 decision 7) */
```

  - after `--entry-width`:

```css
  --entry-scale-narrow: 0.8; /* the entries' scale in the phone layout (3b2 decision 9) */
```

  - after `--slot-height`:

```css
  --deck-width: 100cqi; /* the deck's width, which the compact slot's height reads (3b2 decision 4) */
  --result-least: 11.5rem; /* the compact slot's least height in the wide layout; its result needs about 10 rem */
  --result-least-narrow: 13rem; /* the compact slot's least height in the phone layout; its result needs 11.75 rem */
```

- [ ] **Step 4: Run the real files' test to see it fail.**

Run: `npx vitest run --root frontend src/design/tokens.gate.test.ts`
Expected: 1 failed, `keeps colours and stray units out of tokens.css`, with `['--deck-width: the unit cqi in 100cqi']`.

- [ ] **Step 5: Allow `cqi` on the deck width.** In `gate.ts`, replace the `unitOnlyOn` comment and its `cqi` row:

```ts
// J2: the viewport appears only in the root and the shell's height; em follows its text, cqi its column or deck.
```

```ts
  ['cqi', ['--value-fit', '--deck-width']],
```

- [ ] **Step 6: Run the suite.**

Run: `npm run test:unit && npm run typecheck && npm run lint`
Expected: every test passes, the two above included; no type or lint error.

- [ ] **Step 7: Amend the spec (R1).** In the 3b2 spec:
  - decision 4: "and at least the result's least height (`--result-least`)" becomes "and at least the result's least height (`--result-least`, `--result-least-narrow` in the phone layout)";
  - "The docs' changes", Tokens and gate: add `--result-least-narrow` after `--result-least`.

- [ ] **Step 8: Commit.**

```bash
git add frontend/src/design/gate.ts frontend/src/design/gate.test.ts frontend/src/tokens.css docs/superpowers/specs/2026-10-15-ui-refresh-3b2-narrow-and-large-design.md
git commit -m "feat: add the narrow and large room page's tokens (ui refresh step 3b2)"
```

### Task 2: Port the scratch mockup into `room.html`

**Files:**
- Modify: `docs/design/room.html` (replaced by the port)
- Modify: `docs/design/room-cells.html` (R4)
- Read: `docs/design/room-3b2-final.html` (the scratch, untracked; the oracle)
- Scripts: `~/Documents/pointing-poker-3b2/scripts/oracle.mjs`, `checks.mjs`, `gallery.mjs`

**Interfaces:**
- Consumes: Task 1's tokens.
- Produces, for Task 3: the mockup's parameters (`menu=1`, `room`, `facilitators` added); its three 3b2 blocks, named in Step 3; the checks' output in `<scratchpad>/checks.txt`.

- [ ] **Step 1: Start from the scratch.**

```bash
cp docs/design/room-3b2-final.html docs/design/room.html
```

  - Its title becomes `Room mockup (ui refresh steps 3b1 and 3b2)`.

- [ ] **Step 2: Keep only the settled options.** The scratch's `.shell` carries one class per switch. Keep each default's rules with its class taken out of the selector, and delete the other options' rules and code paths:

| Switch | Keep | Delete |
| --- | --- | --- |
| `n1` the structure | `a`, the table only | `b` |
| `n2` the header | `b`, one row with ☰ | `a` |
| `n3` the deck | `b`, the sheet | `b2`, `c` |
| `n4` after a reveal | `b`, the result in the slot | `c`: `.frozen`, `.result-top`, `frozen`, `resultPanel`, the frozen rules in the phone block |
| `rb` the round bar | `a`, pinned with the sheet | none |
| `sh` the slot's height | `e`, the floor | `b`, `c`, `d` |
| `kt` the kept tag | `b`, on the top line | `a` |
| `rn` the round bar's row | `f` | `a` to `e` |
| `ns` the table's scale | `b` | none |
| `hi` the history | `c`, at the end | `a`, `b` |
| `iw` the issue's width | `a` | `b` |
| `cs` the band's cards | `a` | `b` |
| `n7` the facilitator | `a`: also delete `.fac-page`, `.unpinned`, `pinRule` and its observer and listener (Step 3 replaces them) | `b`, `c` |
| `n8` the issue's link | `c`; `issueHtml` always breaks after the host's dots | `b` |
| `cap` | `106`, read from `--page-max` (Step 3) | `120`, `140`, `--cap` |

  - `.shell`'s class list becomes `shell`; `n2`, `n4` and every `q.get` of a deleted switch go.
  - `placeTop`, its observer and the comment above it go (Step 6 draws the progress in CSS).
  - The parameter comment at the top of the script gains `menu=1` (☰'s row open), `room` (the room id) and `facilitators` (1 to 5, Step 6).

- [ ] **Step 3: Group the rules by the two switches and move the values to tokens.** The scratch's 3b2 rules become three blocks after the forced-colours block, each headed by one comment line:
  1. `/* 3b2: the compact foot below 65.75 rem, in both layouts (decisions 2 to 6) */`, `@container page (width < 65.75rem) { … }`. It holds every rule the scratch's phone blocks and its `51.75rem <= width < 65.75rem` blocks share. That covers the deck's grid and `margin-block: auto`, the slot's height, the stacked result, the chart's figures, the round bar's row and its icons, the kept tag's place, `.round { position: relative; }` and "Pointing Poker" hidden. It also takes the `--cols`/`--rows` rules and `@container deck (width >= 22.25rem)`.
  2. `/* 3b2: the phone layout below 51.75 rem (decisions 1, 7 to 10) */`, `@container page (width < 51.75rem) { … }`, after the first block. It holds the structure, the header and ☰'s row, the facilitators' line, the table's scale, the sheet's look, Clear and Edit as icons, and every phone rule that differs from block 1. The chart's `.columns` gap and least height are among them.
  3. `/* 3b2: the width cap (decision 13) */`, last, as in the scratch: its header padding must win over the phone header's.
  - Values become tokens:
    - `100cqi` → `var(--deck-width)`;
    - the slot's floor → `var(--result-least)` in block 1, `var(--result-least-narrow)` in block 2: one `.slot { height: max(var(--least), calc(…)) }` in block 1 with `--least: var(--result-least)`, overridden in block 2 by `.slot { --least: var(--result-least-narrow); }`;
    - `--s: 0.8` → `--s: var(--entry-scale-narrow)`;
    - the cap's `var(--cap)` → `var(--page-max)`.
  - `.shell { container: page / inline-size; }` and `.round { container: deck / inline-size; }` stay outside the blocks.
  - The pin moves from `pinRule` to CSS. In block 2, `position: sticky` and the `bottom` offsets leave `.round` and `.controls` for a media query after block 2. Left on the `.round` that block 1 makes relative, a `bottom` offset would move it.

```css
  /* The sheet pins where the viewport is at least 39 rem tall (decision 7) */
  @media (min-height: 39rem) {
    @container page (width < 51.75rem) {
      .round { position: sticky; bottom: calc(var(--target-min) + 2 * var(--space-2) + var(--line-hairline)); }
      .controls { position: sticky; bottom: 0; }
    }
  }
```

- [ ] **Step 4: Check the rules' values.**

```bash
node -e '
const s = require("fs").readFileSync("docs/design/room.html", "utf8").match(/<style>([\s\S]*?)<\/style>/)[1]
s.split("\n").forEach((l, i) => /#[0-9a-fA-F]{3,8}\b|rgba?\(|(?<![\w-])\d*\.?\d+(rem|px|em|cqi|vh|vw)\b/.test(l.replace(/var\([^)]*\)/g, "").replace(/@(container|media)[^{]*/, "")) && console.log(i, l.trim()))'
```

  - Expected: no output. Query values (51.75, 65.75, 22.25 and 39 rem) are exempt, as the reference's Tokens section will say (Task 3).

```bash
grep -n "n1-\|n2-\|n3-\|n4-\|rb-\|sh-\|kt-\|rn-\|ns-\|hi-\|iw-\|cs-\|n7-\|n8-\|cap-\|frozen\|unpinned\|fac-page\|placeTop\|pinRule\|scratch" docs/design/room.html
for id in phase-line most-voted tally-entry tally-count tally-value participant participant-estimation facilitator; do printf '%s ' $id; grep -c "data-testid=\"$id\"" docs/design/room.html; done
```

  - Expected: the grep prints nothing; every id at least 1, as before.

- [ ] **Step 5: Prove the port draws what the scratch draws.**

```bash
node ~/Documents/pointing-poker-3b2/scripts/oracle.mjs
```

  - It loads both pages at sizes from 320 by 640 to 2560 by 1440 (both switches' sides, the cap) with each case: both roles, voting, re-vote and revealed, a tie, nobody voted, ☰ open with the longest room id, two banners, a two-line issue and 4 voters. It compares every element's box, font size, colour and visibility, the kept tag's box excepted (R2).
  - Expected: `SAME`. A difference names the first element that differs; fix the port, not the scratch, until it prints `SAME`. The script printed `SAME` with the scratch on both sides.

- [ ] **Step 6: Add what the scratch does not draw.**
  - **Focus's clearance** (decision 7), in Step 3's pin query, its comment becoming "The sheet pins where the viewport is at least 39 rem tall; focus outside it keeps clear of it (decision 7)":

```css
      .header :is(a, button), .issue-panel :is(a, button, input), .people { scroll-margin-bottom: var(--sheet-clearance); }
```

  - **Copy link's hit area** (R2), in block 2:

```css
    .chip a::after { inset: calc((100% - var(--target-min)) / 2); }
```

  - **The drawn progress on the top line** (decision 4), replacing `placeTop`: in `draw()`, before the voter's deck,

```js
  const topProgress = later && voter && !revealed ? `<span class="progress top-progress later">${voted} of ${people.length} voted</span>` : ''
```

  - `if (voter) slot = revealed ? chart : deckBlock` becomes `if (voter) slot = revealed ? chart : topProgress + deckBlock`.
  - Delete block 1's `.controls .progress` and `.controls .progress i` rules and its `.controls { position: relative; }`. Add:

```css
  .top-progress { display: none; }
```

  and in block 1:

```css
    .controls .progress { display: none; }
    .top-progress { display: block; position: absolute; left: var(--panel-inline); top: calc(var(--panel-gap) + var(--space-2) - var(--text-tag) * var(--leading-body) - var(--space-1)); padding: 0; }
```

  - **The facilitators' line** (decision 7):

```js
const facilitators = ['Peggy', 'Victor', 'Walter', 'Trent', 'Sybil'].slice(0, Math.max(1, Number(q.get('facilitators') || 2)))
```

  and in `draw()`, the line names two, then the rest as a count:

```js
  const facNames = facilitators.length > 2 ? `${facilitators.slice(0, 2).join(', ')} and ${facilitators.length - 2} more` : facilitators.join(', ')
```

  with `<p class="fac-line">Facilitators: ${facNames}</p>` in the table's template.
  - **The disclosure** (the spec's Disclosure table):
    - one rem figure for the script, used by `fitEntries` too:

```js
const phoneBelow = 51.75   // the structure switch (decision 1); container queries have no script API
const isPhone = () => document.querySelector('.shell').clientWidth / parseFloat(getComputedStyle(document.documentElement).fontSize) < phoneBelow
```

    - `fitEntries`'s first test becomes `if (isPhone()) { list.style.removeProperty('--s'); list.style.maxWidth = ''; return }`;
    - in `draw()`, beside `keep`, `const onMenu = document.activeElement?.classList.contains('menu-btn')`, and after the render `if (onMenu) document.querySelector('.menu-btn').focus()`, so a tap or Enter on ☰ leaves focus on it;
    - after the click handler:

```js
// ☰'s row closes on Escape from ☰ or the row, focus back on ☰; crossing 51.75 rem closes it
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !menuShown || !e.target.closest?.('.menu, .menu-btn')) return
  menuShown = false; draw(); document.querySelector('.menu-btn').focus()
})
new ResizeObserver(() => { if (menuShown && !isPhone()) { menuShown = false; draw() } }).observe(document.getElementById('root'))
```

  - Run the oracle again: `node ~/Documents/pointing-poker-3b2/scripts/oracle.mjs`. Expected: `SAME`. None of these changes moves an element in the oracle's cases; the progress shows only with `later=1`, which the oracle leaves out.

- [ ] **Step 7: Run the checks.**

```bash
node ~/Documents/pointing-poker-3b2/scripts/checks.mjs > <scratchpad>/checks.txt 2>&1; tail -3 <scratchpad>/checks.txt
```

  - It takes about 5 minutes. Its sections:
    1. no spill from the round panel, the round bar or the page, 320 to 1180 px wide at 743 and 900 tall, both roles, three phases, `later` 0 and 1;
    2. a resize across either switch, either way, equals a load;
    3. the kept tag on the top line, inside the round panel, above the first row, level with the drawn progress, pinned or flowing;
    4. the pin from 624 px tall in the phone layout only;
    5. the phone header's targets;
    6. Tab into the table lands clear of the sheet in Chromium and Firefox, and no clearance in the wide layout or where the sheet flows;
    7. the disclosure's rows of the table;
    8. the cap and the facilitators' line;
    9. "Link copied" with the longest room id.
  - Expected: `ALL PASS` and `ERRORS []`.
  - On the scratch the same run fails exactly as `~/Documents/pointing-poker-3b2/scripts/checks-on-the-scratch.txt` records:
    - spills, only for the progress the scratch placed by script;
    - the tag where the sheet flows (R2);
    - Copy link's 30 px width (R2);
    - focus under the sheet;
    - the disclosure;
    - five facilitators.
    Each section can therefore fail.

- [ ] **Step 8: The cells (R4).** In `room-cells.html`:
  - `options` gains `width: [['1280', '1280 (wide layout)'], ['1000', '1000 (compact foot)'], ['800', '800 (phone layout)'], ['392', '392 (a phone)']]`. `height` gains `['900', '900']` and `['743', '743 (a phone)']`. `state` gains `width: '1280'`.
  - `1280px` in `.grid`, `.frame` and `iframe` becomes `var(--w)`; `render()` sets `--w` on the grid and each frame, as it sets `--s`.
  - The intro and the script's first comment say "at the chosen width" for "at 1280 px wide"; the title says "(ui refresh steps 3b1 and 3b2)".
  - Open it and pick each width. Expected: the cells redraw at that width.

- [ ] **Step 9: The gallery, and a look.**

```bash
PAGE=file://$PWD/docs/design/room.html node ~/Documents/pointing-poker-3b2/scripts/gallery.mjs
```

  - Change the gallery's intro line to name `room.html`.
  - Open `~/Documents/pointing-poker-3b2/breakpoints/index.html`. Expected: every pair of pictures looks like the scratch's.
  - Look at `room.html` at 392 by 743 under `forced-colors: active` (Playwright's `emulateMedia({ forcedColors: 'active' })`) with ☰ open and a kept vote. Expected: ☰, its row, the sheet's edge and the kept tag stay visible.

- [ ] **Step 10: Commit.**

```bash
git add docs/design/room.html docs/design/room-cells.html
git commit -m "docs: give the room page mockup its phone layout and width cap (ui refresh step 3b2)"
```

### Task 3: The reference and the docs that point to it

**Files:**
- Modify: `docs/design/ui-reference.md`
- Modify: `docs/known-issues.md` ("A reveal with votes still pushes the participants list down")
- Modify: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md` (step 4's checks)
- Modify: `docs/superpowers/specs/2026-10-15-ui-refresh-3b2-narrow-and-large-design.md` (decision 15, R3)

**Interfaces:**
- Consumes: Task 1's token names; Task 2's parameters and blocks.
- Produces: nothing later.

- [ ] **Step 1: The reference.**
  - **Mockups:** `room.html` draws the room page at every width; its parameters gain `menu`, `room` and `facilitators`. `room-cells.html` gains its width and heights.
  - **J2:** the `cqi` sentence adds "and the deck's width, so that the compact slot follows its deck"; "the narrow layout" becomes "the phone layout (J11)".
  - **J3:**
    - delete the table's row "Revealed, where a deck stays (3b2)";
    - "A card's size is 3b's, with a token 3b adds: … (L5)" points to J11;
    - the tag's bullet says that in the compact foot the tag sits on the top line, away from its card, the kept frame marking the card.
  - **J5:** after the destructive bullet, add: "In the phone layout Clear and Edit are their icons alone, their names kept; Clear is marked by its icon, its quiet look and its distance (3b2 decision 10)." The destructive bullet's "marked by its words" gains "(its icon in the phone layout)".
  - **J8:** delete the bullet "Where a deck stays after a reveal (3b2's layouts; …)".
  - **New J11. Narrow and large screens**, after J10. It opens with "Step 3b2's spec holds its rules,", then the spec's path, "and `room.html` draws them." Then one sentence each:
    - the two switches (51.75 rem the structure, 65.75 rem the foot, both container queries on the page's width);
    - the compact foot;
    - the phone layout and its sheet, pinned from 39 rem tall;
    - the cap at 106 rem.
  - **Tokens:**
    - the exemption sentence names "the switches' values in container and media queries (J11), which cannot read a token" in place of "L11's values in media and container queries";
    - the Layout row adds "from 3b2, the width cap, the sheet's clearance, the phone's entry scale, the deck's width and the result's least heights".
  - **Open:**
    - the settled line adds "L5, L10 and L11 by 3b2 (J11)";
    - delete the L5, L10 and L11 bullets, keeping L11's last two sentences (the scrollbar's gutter; media queries in `rem` against the reader's default size) in J11;
    - add a **Parked** list with the spec's three parked items.
  - **Decisions log:** a **3b2** entry after **3a2**. It names the spec, then states briefly:
    - **Kept:** two switches, not three layouts, since the phone layout's foot serves the band; the cap at 106 rem, a 1080p monitor's page and a hand check, capping 1440p, the user's screen and 4K, for less eye travel; 51.75 rem where the full header holds the longest room id with "Link copied" and a three-way tie, Next issue and the progress still fit the round bar (36 px bars at 840 px).
    - **Set aside:**
      - the roster's rows for the table, and both lists, on a phone;
      - two header rows with every word, and an overlay menu;
      - a flowing deck, low keys and the deck first;
      - a frozen deck after a reveal, and a shrinking or centred slot;
      - every round action as an icon, and a round menu;
      - the round bar at the page's end;
      - a single column from 46.75 rem;
      - pinning at 47 rem tall;
      - `scroll-padding` on `html`;
      - Clear as an icon in the wide layout;
      - no cap, and 120 or 140 rem;
      - hiding "https://".
- [ ] **Step 2: Known issues.** "A reveal with votes still pushes the participants list down" gains, under **Issue:**, that step 3b2 accepts the same movement on the facilitator's phone page until the progress step fills its slot while voting (3b2's Accepted costs).
- [ ] **Step 3: The parent's step 4.** After the 200% check, add: "- Resizing a window across 51.75 or 65.75 rem gives the layout a load at that width gives, the table's scale and ☰'s row included (3b2)."
- [ ] **Step 4: The spec's decision 15 (R3).** After "the progress's order in the DOM is the progress step's call;" add "its place on the top line must clear a lifted card in the first row, which the drawn progress does not (a lift is `--space-2`);".
- [ ] **Step 5: Check.**

```bash
grep -n "where a deck stays\|frozen deck\|L5\.\|L10\.\|L11\." docs/design/ui-reference.md
```

  - Expected: hits only in the decisions log, as history.
- [ ] **Step 6: Commit.**

```bash
git add docs/design/ui-reference.md docs/known-issues.md docs/superpowers/specs/2026-09-30-ui-refresh-design.md docs/superpowers/specs/2026-10-15-ui-refresh-3b2-narrow-and-large-design.md
git commit -m "docs: give the design reference the narrow and large room page (ui refresh step 3b2)"
```

### Task 4: Retire the scratch mockups

- [ ] **Step 1:** once the user has judged `room.html` and agrees, move the untracked scratch files out of the repo, keeping them beside the 3b2 records:

```bash
mkdir -p ~/Documents/pointing-poker-3b2/scratch && mv docs/design/room-3b2*.html ~/Documents/pointing-poker-3b2/scratch/
git status --short
```

  - Expected: `git status` shows nothing untracked under `docs/design/`. The moved files' stylesheet links no longer resolve; they are a record, not a page to open.
