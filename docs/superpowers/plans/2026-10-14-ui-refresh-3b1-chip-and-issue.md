# UI Refresh Step 3b1: The Room Chip and the Issue Panel, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two looks the user found against the designer's draft after PR #445: the room chip filling the header, and the issue panel's margins.

**Architecture:**
- Task 1, on `20260930.ui_refresh_3b1_wide_room_page` (PR #445), one commit: the mockup's CSS, the 3b1 spec's re-measured figures, and two lines of the design reference.
- Task 2, on `20260930.ui_refresh_3a2_root_height` (PR #446): an ordinary merge of the 3b1 branch, so nothing is rebased or force-pushed.
- Every edit, figure and merge below ran in a dry run on 2026-10-14: a scratch worktree of the 3b1 branch, and `git merge-tree` against the 3a2 branch, which merged without a conflict.

**Tech Stack:** HTML and CSS (the mockup), Playwright's Chromium (the measurements), Vitest (`npm run test:unit`).

**Spec:** `docs/superpowers/specs/2026-10-09-ui-refresh-3b1-wide-room-page-design.md`, whose Measured section this plan updates. The decisions were settled with the user in chat on 2026-10-14, on pictures of each option:
1. The room chip keeps the draft's size: Copy link is drawn 31 px tall, and an unseen layer gives it a 44 px target (WCAG 2.5.5, `--target-min`).
2. The issue panel keeps its side margin, `--panel-inline`, on all four sides whatever its number of lines; one line takes the round bar's 62 px; Edit's target still reaches into the padding.
3. The round bar does not change.
4. Copy link stays ink; the designer's red waits on the designer's final validation, written in the reference's Open.

## Global Constraints

- Commit messages in Conventional Commits; never a generated-with or co-authored-by line.
- Code and CSS comments are one or two lines.
- New commits only: no amend, rebase or force-push. Push nothing until the user has seen the result.
- In docs, cite a PR number or a main commit, never a branch's commit hash.

## Review Focus

1. Copy link's target must stay 44 px though it is drawn 31 px: a click 21 px above or below its centre lands on it (Task 1, Step 3).
2. The issue panel must grow with its text, never clip it, on a short page with two banners: its minimum sits on `.issue`, not on the panel, whose explicit minimum would override the flex item's automatic one (Task 1, Step 3).
3. No reveal may change the entries' scale, and the round bar must stay put through a reveal (Task 1, Step 4).
4. Only the figures this change moves may change in the spec; the deck's card sizes, which depend on width, must not (Task 1, Step 4).
5. The merge into 3a2 must keep 3a2's joined shadows and value source (Task 2, Step 2).

---

### Task 1: The mockup and the 3b1 docs

**Files:**
- Modify: `docs/design/room.html`, `docs/superpowers/specs/2026-10-09-ui-refresh-3b1-wide-room-page-design.md`, `docs/design/ui-reference.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the 3b1 branch's new tip, which Task 2 merges.

- [ ] **Step 1: Keep the mockup as it is, and write the measuring script**

`$W` is this plan's workspace, `.superpowers/sdd/2026-10-14-ui-refresh-3b1-chip-and-issue/`.

```bash
cp docs/design/room.html "$W/room-before.html"
```

Write `$W/measure-3b1.mjs`. It reads every height-dependent figure in the spec's Measured section, from the mockup given as its argument:

```js
import { chromium } from '/home/lt/work/lunatech/internal/planning_poker/lunatech-pointingpoker/node_modules/playwright/index.mjs'
// Every height-dependent figure in the 3b1 spec's Measured section, for the mockup given as argument.
const file = process.argv[2]
const long = 'Rework the login page so that a returning user lands on their last room, and keep the room list in sync with the rooms they were invited to since their last visit, including the rooms that were renamed or archived meanwhile by a facilitator'
const views = { floor: [1280, 600], comfort: [1280, 680], '1512x749': [1512, 749], 'half 1280x1300': [1280, 1300], 'half 1472x1493': [1472, 1493] }
const b = await chromium.launch()
const read = async ([w, h], params, act) => {
  const p = await b.newPage({ viewport: { width: w, height: h } })
  await p.goto(`file://${file}?${new URLSearchParams(params)}`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150)
  if (act) { await act(p); await p.waitForTimeout(300) }
  const r = await p.evaluate(() => {
    const t = document.querySelector('.people'), tr = t.getBoundingClientRect(), lis = [...document.querySelectorAll('.entries li')]
    const inView = lis.filter(li => { const r = li.getBoundingClientRect(); return r.top >= tr.top - 0.5 && r.bottom <= tr.bottom + 0.5 }).length
    return { s: getComputedStyle(document.querySelector('.entries')).getPropertyValue('--s').trim(), inView, total: lis.length,
      tableScroll: t.scrollHeight - t.clientHeight, table: Math.round(tr.height), page: document.scrollingElement.scrollHeight - innerHeight,
      bar: Math.round(document.querySelector('.controls').getBoundingClientRect().top + scrollY), scrollY: Math.round(scrollY) }
  })
  await p.close(); return r
}
const s2 = s => (+s).toFixed(2)
console.log('# The table, voter while voting')
for (const [n, v] of Object.entries(views)) {
  const r = await read(v, {}); console.log(n, 'scale', s2(r.s), `${r.inView} of ${r.total} in view`, 'table scroll', r.tableScroll, 'page', r.page)
}
for (const m of ['lost', 'lost,moved']) { const r = await read(views['1512x749'], { message: m }); console.log('1512x749', m, 'scale', s2(r.s), `${r.inView} of ${r.total}`, 'page', r.page) }
console.log('# A 240-character issue: the table\'s height')
for (const [n, v, params] of [['floor', views.floor, {}], ['comfort', views.comfort, {}], ['1068x600', [1068, 600], {}], ['1068x600 one banner', [1068, 600], { message: 'lost' }]]) {
  const r = await read(v, { issue: long, ...params }); console.log(n, 'table', r.table, 'page', r.page)
}
console.log('# Banners')
{ const r = await read(views.comfort, { message: 'lost' }); console.log('comfort one banner', `${r.inView} of ${r.total} in view`, 'page', r.page) }
for (const m of ['lost', 'lost,moved']) { const r = await read(views.floor, { message: m }); console.log('floor', m, 'table', r.table, 'page', r.page) }
console.log('# Two banners and a 240-character issue: page scroll, and the round bar through a reveal')
for (const role of ['voter', 'facilitator']) for (const v of [views.floor, [1068, 600]]) {
  const params = { role, issue: long, message: 'lost,moved' }
  const a = await read(v, params), z = await read(v, params, p => p.click('[data-do="show"]'))
  const rv = await read(v, { ...params, phase: 'revealed' })
  console.log(role, v.join('x'), 'page voting', a.page, 'revealed', rv.page, 'bar moves on reveal', a.bar !== z.bar, 'bar', a.bar, z.bar, 'scrollY', a.scrollY, z.scrollY)
}
console.log('# No reveal changes the scale; the page never scrolls')
let sets = 0, changed = [], scrolled = []
for (const [n, v] of Object.entries(views)) for (const role of ['voter', 'facilitator']) for (const later of ['0', '1']) for (const message of ['', 'lost', 'lost,moved']) {
  const ss = []
  for (const phase of ['voting', 'revote', 'revealed', 'revealed-revote']) {
    const r = await read(v, { role, later, message, phase }); ss.push(r.s); if (r.page > 0) scrolled.push(`${n} ${role} later=${later} ${message} ${phase} ${r.page}`)
  }
  sets++; if (new Set(ss).size > 1) changed.push(`${n} ${role} later=${later} ${message}: ${ss.join(' ')}`)
}
console.log(sets, 'sets;', 'scale changes:', changed.length ? changed : 'none', '; scrolls:', scrolled.length ? scrolled : 'none')
await b.close()
```

Run: `node "$W/measure-3b1.mjs" "$PWD/docs/design/room.html" > "$W/measure-before.txt"; cat "$W/measure-before.txt"`
Expected: the spec's figures today, which proves the script reads what the spec states:

```
# The table, voter while voting
floor scale 1.00 7 of 14 in view table scroll 65 page 0
comfort scale 1.08 14 of 14 in view table scroll 0 page 0
1512x749 scale 1.42 14 of 14 in view table scroll 0 page 0
half 1280x1300 scale 1.42 14 of 14 in view table scroll 0 page 0
half 1472x1493 scale 1.42 14 of 14 in view table scroll 0 page 0
1512x749 lost scale 1.18 14 of 14 page 0
1512x749 lost,moved scale 1.00 14 of 14 page 0
# A 240-character issue: the table's height
floor table 161 page 0
comfort table 241 page 0
1068x600 table 138 page 0
1068x600 one banner table 88 page 0
# Banners
comfort one banner 7 of 14 in view page 0
floor lost table 157 page 0
floor lost,moved table 87 page 0
# Two banners and a 240-character issue: page scroll, and the round bar through a reveal
voter 1280x600 page voting 23 revealed 23 bar moves on reveal false bar 561 561 scrollY 0 14
voter 1068x600 page voting 46 revealed 46 bar moves on reveal false bar 584 584 scrollY 0 37
facilitator 1280x600 page voting 23 revealed 23 bar moves on reveal false bar 561 561 scrollY 0 14
facilitator 1068x600 page voting 46 revealed 46 bar moves on reveal false bar 584 584 scrollY 0 37
# No reveal changes the scale; the page never scrolls
60 sets; scale changes: none ; scrolls: none
```

- [ ] **Step 2: The mockup's CSS and markup**

In `docs/design/room.html`, four replacements, each old string occurring once.

In `.chip a`'s first line, `align-items: center; min-height: var(--target-min); font-size: var(--text-sm);` → `align-items: center; position: relative; font-size: var(--text-sm);`.

After `  .chip a svg { width: var(--text-sm); height: var(--text-sm); }`, add:

```css
  /* Copy link keeps the draft's size; its target reaches 44 px unseen (WCAG 2.5.5) */
  .chip a::after { content: ''; position: absolute; inset: calc((100% - var(--target-min)) / 2) 0; }
```

Replace:

```css
  /* H: the issue at heading size */
  .issue { display: flex; align-items: center; gap: var(--space-3); }
```

with:

```css
  /* H: the issue at heading size, its margin the panel's side margin all round */
  .issue-panel { padding-block: var(--panel-inline); }
  /* One line matches the round bar's height: its 44 px controls and 8 px padding */
  .issue { display: flex; align-items: center; gap: var(--space-3); min-height: calc(var(--target-min) + 2 * var(--space-2) - 2 * var(--panel-inline)); }
```

In the script, `<section class="panel"><div class="issue">` → `<section class="panel issue-panel"><div class="issue">`.

`.issue-panel` comes after `.panel`, so its padding wins. The minimum sits on `.issue`, the panel's content, not on the panel (Review Focus 2). `.issue .quiet`'s negative margin stays: Edit's 44 px target still reaches into the padding.

- [ ] **Step 3: Check the target and the panel's margins (Review Focus 1 and 2)**

Write `$W/check.mjs`:

```js
import { chromium } from '/home/lt/work/lunatech/internal/planning_poker/lunatech-pointingpoker/node_modules/playwright/index.mjs'
// Copy link's target and the issue panel's margins, at one, two and three lines.
const long = 'Rework the login page so that a returning user lands on their last room, and keep the room list in sync with the rooms they were invited to since their last visit, including the rooms that were renamed or archived meanwhile by a facilitator'
const b = await chromium.launch()
for (const [label, size, params] of [['one line', [1280, 680], {}], ['two lines', [1280, 680], { issue: long.slice(0, 150) }],
  ['three lines', [1280, 680], { issue: long }], ['three lines, two banners, floor', [1280, 600], { issue: long, message: 'lost,moved' }]]) {
  const p = await b.newPage({ viewport: { width: size[0], height: size[1] } })
  await p.goto(`file://${process.argv[2]}?${new URLSearchParams({ role: 'facilitator', ...params })}`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300)
  console.log(label, JSON.stringify(await p.evaluate(() => {
    const a = document.querySelector('.chip a').getBoundingClientRect(), cx = a.left + a.width / 2, cy = a.top + a.height / 2
    const hit = dy => !!document.elementFromPoint(cx, cy + dy)?.closest('.chip a')
    const pn = document.querySelector('.issue-panel, .issue').closest('.panel').getBoundingClientRect(), t = document.createRange()
    t.selectNodeContents(document.querySelector('.issue h2')); const tr = t.getBoundingClientRect()
    return { chip: document.querySelector('.chip').getBoundingClientRect().height, link: a.height, target44: hit(-21) && hit(21) && !hit(-23) && !hit(23),
      panel: Math.round(pn.height), top: +(tr.top - pn.top).toFixed(1), bottom: +(pn.bottom - tr.bottom).toFixed(1), side: +(tr.left - pn.left).toFixed(1),
      round: document.querySelector('.controls').getBoundingClientRect().height }
  })))
  await p.close()
}
await b.close()
```

Run: `node "$W/check.mjs" "$W/room-before.html"` from the repo root after copying `$W/room-before.html` to `docs/design/room-before.tmp.html` (so its relative links resolve), then delete the copy; and `node "$W/check.mjs" "$PWD/docs/design/room.html"`.
Expected before: `chip` 54, `link` 44, `target44` true, one line `panel` 53 with `top` 14, three lines `panel` 99.
Expected after:

```
one line {"chip":41,"link":31,"target44":true,"panel":62,"top":18.5,"bottom":19.5,"side":19,"round":62}
two lines {"chip":41,"link":31,"target44":true,"panel":84,"top":18,"bottom":19,"side":19,"round":62}
three lines {"chip":41,"link":31,"target44":true,"panel":107,"top":18,"bottom":19,"side":19,"round":62}
three lines, two banners, floor {"chip":41,"link":31,"target44":true,"panel":107,"top":18,"bottom":19,"side":19,"round":62}
```

The last line is Review Focus 2: on the shortest page the panel keeps 107 px and its text inside, where a minimum on the panel shrank it to 62.

- [ ] **Step 4: Re-measure the spec's figures (Review Focus 3 and 4)**

Run: `node "$W/measure-3b1.mjs" "$PWD/docs/design/room.html" > "$W/measure-after.txt"; diff "$W/measure-before.txt" "$W/measure-after.txt"`
Expected: exactly these lines change; the half monitors, the two-banner scale at 1512 by 749, the comfort target's banner count and the last line (`60 sets; scale changes: none ; scrolls: none`) do not:

```
floor scale 1.00 7 of 14 in view table scroll 74 page 0
comfort scale 1.02 14 of 14 in view table scroll 0 page 0
1512x749 scale 1.40 14 of 14 in view table scroll 0 page 0
1512x749 lost scale 1.12 14 of 14 page 0
floor table 153 page 0
comfort table 233 page 0
1068x600 table 130 page 0
1068x600 one banner table 80 page 0
floor lost table 148 page 0
floor lost,moved table 80 page 0
voter 1280x600 page voting 31 revealed 31 bar moves on reveal false bar 569 569 scrollY 0 22
voter 1068x600 page voting 54 revealed 54 bar moves on reveal false bar 592 592 scrollY 0 54
facilitator 1280x600 page voting 31 revealed 31 bar moves on reveal false bar 569 569 scrollY 0 22
facilitator 1068x600 page voting 54 revealed 54 bar moves on reveal false bar 592 592 scrollY 0 54
```

The deck's cards depend on width only. Check them unchanged: at 1280 by 680, 1280 by 1300, 1263 by 1300, 1066 by 600 and 1168 by 1000, the first unconfirmed `.card`'s height in rem is `5.30 4.15 4.11 3.86 3.85`, before and after.

- [ ] **Step 5: The spec's Measured section**

In `docs/superpowers/specs/2026-10-09-ui-refresh-3b1-wide-room-page-design.md`, the table's three rows:

```
| The floor | 1.00 | 7 of 14 entries in view, 65 px to scroll |
| The comfort target | 1.08 | all 14 in view |
| 1512 by 749 | 1.42; 1.18 with one banner, 1.00 with two | all 14 in view |
```
→
```
| The floor | 1.00 | 7 of 14 entries in view, 74 px to scroll |
| The comfort target | 1.02 | all 14 in view |
| 1512 by 749 | 1.40; 1.12 with one banner, 1.00 with two | all 14 in view |
```

and the two bullets:

```
- A 240-character issue keeps the page still: the table keeps 161 px at the
  floor and 241 at the comfort target. Just above the breakpoint, a 1068 px
  window, it keeps 138 px at the floor, and 88 with a banner, over its 80 px
  minimum.
- Banners: one at the comfort target leaves 7 of 14 entries in view; at the
  floor one leaves the table 157 px and two 87 px; the page never scrolls.
  With two and a 240-character issue, either page scrolls 23 px at the floor
  and 46 px at the breakpoint in both phases, and the round bar stays put
  through the reveal.
```
→
```
- A 240-character issue keeps the page still: the table keeps 153 px at the
  floor and 233 at the comfort target. Just above the breakpoint, a 1068 px
  window, it keeps 130 px at the floor, and with a banner its 80 px minimum.
- Banners: one at the comfort target leaves 7 of 14 entries in view; at the
  floor one leaves the table 148 px and two its 80 px minimum; the page never
  scrolls. With two and a 240-character issue, either page scrolls 31 px at
  the floor and 54 px at the breakpoint in both phases, and the round bar
  stays put through the reveal.
```

- [ ] **Step 6: The reference**

In `docs/design/ui-reference.md`, Open, after the bullet `- **Layout f or g**, …` that ends `card's darker red against the designer's brighter one.`, add:

```
- **Copy link's colour**: ink since 3b1's review wave (J4); the designer's red
  waits on the designer's final validation.
```

In the log, after the sub-entry `  - **Its final review** darkened the kept amber one step, …` that ends `` `--burgundy`, the one red fill with text. ``, add:

```
  - **A comparison with the designer's draft** brought back the room chip's
    size: Copy link's 44 px target had filled the header and merged the chip
    into the page, so the target reaches past the link unseen. The issue
    panel keeps the side margin all round, whatever its number of lines, and
    one line takes the round bar's height, so the two bars match. The entries
    lose a little scale for it, 1.02 at the comfort target from 1.08.
```

- [ ] **Step 7: Check and commit**

Run: `grep -n "65 px to scroll\|1\.08 |\|161 px\|88 with a banner\|157 px\|23 px at the floor" docs/superpowers/specs/2026-10-09-ui-refresh-3b1-wide-room-page-design.md`
Expected: no output.

Run: `npm run test:unit`
Expected: `Tests 422 passed (422)`, the 3b1 branch's count, unchanged.

```bash
git add docs/design/room.html docs/design/ui-reference.md docs/superpowers/specs/2026-10-09-ui-refresh-3b1-wide-room-page-design.md
git commit -m "docs: fix the room chip and the issue panel's margins (ui refresh step 3b1)"
```

---

### Task 2: Merge into 3a2

**Files:**
- Merge: the 3b1 branch into `20260930.ui_refresh_3a2_root_height`.

**Interfaces:**
- Consumes: Task 1's commit.
- Produces: the 3a2 branch with both fixes, for PR #446.

- [ ] **Step 1: Merge**

```bash
git checkout 20260930.ui_refresh_3a2_root_height
git merge --no-ff 20260930.ui_refresh_3b1_wide_room_page -m "chore: merge the room chip and issue panel fixes from step 3b1 (ui refresh step 3a2)"
```

Expected: no conflict (the dry run's `git merge-tree` wrote a tree with none).

- [ ] **Step 2: Check the merged mockup (Review Focus 5)**

Run: `grep -c "var(--shadow) var(--shadow-colour)\|var(--lift-shadow) var(--lift-colour)\|issue-panel\|chip a::after" docs/design/room.html`
Expected: `6`, 3a2's three joined shadows and this fix's three lines.

Run: `node "$W/measure-3b1.mjs" "$PWD/docs/design/room.html" | diff "$W/measure-after.txt" -`
Expected: no output: the merged page measures as Task 1's.

Run: `npm run test:unit && npm run typecheck && npm run lint`
Expected: `Tests 531 passed (531)`, then no typecheck or lint output.

Push nothing: the user sees the result first, then both branches are pushed together.

---

### Final review fixes

The final review found no Critical or Important issue. The user settled its findings in chat on 2026-10-15:

1. The round bar reaches 2 px into the page's bottom margin at the floor with two banners: accepted, and the spec says so.
2. The issue editor keeps the issue panel's margins: its section takes `issue-panel` too.
3. Measured to the ink, equal padding does not look equal: the issue's large heading needs the 18 px; the voters panel's tightness and the result's larger top come from 3b1 decisions 10 and 5, so they go to the reference's Open for the designer's final validation.
4. Wording: the spec's commit list, the mockup's comment naming its tokens, and `--panel-gap`'s comment in 3a2's `tokens.css`.

**On the 3b1 branch, one commit** `docs: fix the room page after the chip and issue panel review (ui refresh step 3b1)`:
- `docs/design/room.html`: in the editor's `issueBlock`, `<section class="panel"><div class="issue-edit">` → `<section class="panel issue-panel"><div class="issue-edit">`; the comment `its 44 px controls and 8 px padding` → `its --target-min controls and --space-2 padding`.
- The 3b1 spec's banners bullet gains `the round bar then 2 px into the page's bottom margin`; its commit list says thirteen commits and gains 11 to 13.
- The reference's Open gains `The voters panel's room` and `The result's balance`.
- Check: with `message=conflict`, the editor's panel padding goes from 14 px to 18 px top and bottom; `measure-3b1.mjs` still equals `measure-after.txt`; `npm run test:unit` gives 422.

**On the 3a2 branch**, after it takes the 3b1 commit: `frontend/src/tokens.css`'s `--panel-gap` comment → `between panels, and a panel's block padding unless it sets its own`, in its own commit. The mockup's copy of that comment on the 3b1 branch stays, since 3a2 moves the block out and an edit there would conflict.
