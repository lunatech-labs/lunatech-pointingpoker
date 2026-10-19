# UI Refresh Step 3b3: The Issue Editor and the Messages, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw the issue editor's editing view and the banners' rules in `docs/design/room.html` and `room-cells.html`, and give the design reference, the parent spec and the known issues what step 3b3 decided.

**Architecture:**
- Step 3b3 changes no app code: its deliverables are docs and mockups, judged by the product owner on `room.html`. Step 4 builds the page.
- Three commits after the spec's, in the order its "Branches and commits" gives:
  1. the parent and 3b1 pointers (Task 1), judged by reading;
  2. the mockup (Task 2), judged by the product owner and by a script that can fail;
  3. the reference and the known issues (Task 3).
- The script `~/Documents/pointing-poker-3b3/scripts/checks.mjs` (outside the repo, like 3b2's) is written first and run on today's mockup, where it must fail, then run again once the mockup is drawn.

**Tech Stack:** static HTML, CSS and JavaScript (the mockup); Playwright's Chromium and Firefox from the repo's `node_modules/playwright` (the checks); Markdown.

**Spec:** `docs/superpowers/specs/2026-10-16-ui-refresh-3b3-issue-editor-and-messages-design.md`. Read it first: its Terms (banner, problem, notice, Messages section, message panel, editor panel, editor region, wide and phone layouts), its decisions 1 to 11, its states table and its Contract are what this plan carries out. The record of the options, with what was rejected, is `~/Documents/pointing-poker-3b3/DECISIONS.md`, outside the repo.

## Rulings this plan makes, for the user's review

- **R1. The editor's panels carry no role of their own.** Today's `msg()` in `room.html` gives a problem `role="alert"` and a notice `role="status"`. Inside the editor region, which is already `role="status"`, that would nest live regions and split the announcement the spec's Contract reads as one string (decision 11). The editor's panels are plain boxes; the banners keep their roles (3b1).
- **R2. A one-line issue keeps its read height on the wide layout.** The spec is silent on whether entering Edit moves the table for a short issue. The field and the buttons take the negative margin Edit already has, so the panel is as tall editing as reading; Check 5 proves it. On the phone layout the buttons' row adds height, which decision 8 accepts by putting them below the field.
- **R3. The muted saving look uses tokens that exist.** Save is `--track` ground with `--grey` text, Cancel is `--grey` text on the hairline edge. No new token.
- **R4. The mockup's `edit` parameter.** `edit=1` draws the editing view, `edit=saving` its saving look; `message=conflict` or `save-failed` imply `edit=1`, as the mockup already drew them in a dashed editor.

## Global Constraints

**Branch and commits:**
- Branch `20260930.ui_refresh_3b3_issue_editor_and_messages`, stacked on #448. New commits only: no amend, rebase or force-push. Nothing is pushed until the user asks.
- Commit subjects, verbatim, in Conventional Commits:
  - Task 0: `docs: plan the issue editor and the messages (ui refresh step 3b3)`
  - Task 1: `docs: point the parent and 3b1 at step 3b3 and move the lobby's messages to 3b4`
  - Task 2: `docs: draw the issue editor's editing view and the messages in the room mockup (ui refresh step 3b3)`
  - Task 3: `docs: give the design reference the issue editor and the messages (ui refresh step 3b3)`
- No "Generated with Claude Code" or co-author line.

**Values, verbatim from the spec:**
- The structure switch: `51.75rem`. Targets: `--target-min`.
- Names kept: "Current issue" (a textbox), "Edit issue", "Save issue", "Cancel editing", "Dismiss", the section "Messages". Visible words: "Save" and "Cancel".
- The editor's two messages: "Could not save the issue" (problem) and `Changed by someone else to: "PP-1240"` with "Use theirs" (notice).
- The stack by tone: the lost connection, then the moved link, then the restart.

**Writing:**
- Code and CSS comments are one or two lines.
- Cite symbols and section names, never line numbers; in docs, a PR number or a main commit, never a branch hash.
- No counts of commits, edits, items or lines in docs or PR bodies.
- A delivered spec is edited only where this plan says: the parent's open step lines and principle 4's cell, and 3b1's status line.
- Subagents run on Opus, Sonnet or Haiku, never Fable.
- Scripts run from the repository root.

## Review Focus

1. **Both editor messages and a long issue at every width from 320 to 1180 px**: nothing leaves the panel, the whole issue stays visible in the field. Task 2, Step 6 (check 4).
2. **The tab order is the screen order**, in Chromium and in Firefox, in both layouts: field, Save, Cancel, then the messages. Task 2, Step 6 (checks 1 and 8).
3. **A one-line issue does not move the table when Edit is pressed** on the wide layout. Task 2, Step 6 (check 5).
4. **The saving look is muted yet the buttons still take focus**, and the field is read-only. Task 2, Step 6 (check 6).
5. **The lobby's "session ended" is gone, and no empty Messages landmark** shows with no banner; banners keep the tone order whatever order the URL names them. Task 2, Step 6 (checks 7 and 9).

---

### Task 0: Commit this plan

- [ ] **Step 1:** after the user's review, commit only this file.

```bash
git add docs/superpowers/plans/2026-10-19-ui-refresh-3b3-issue-editor-and-messages.md
git commit -m "docs: plan the issue editor and the messages (ui refresh step 3b3)"
```

### Task 1: The parent and 3b1 pointers

**Files:**
- Modify: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md` (step 3's 3b3 and 3b4 lines; principle 4's table cell)
- Modify: `docs/superpowers/specs/2026-10-09-ui-refresh-3b1-wide-room-page-design.md` (the Status line)

**Interfaces:**
- Consumes: the 3b3 spec's decision 1.
- Produces: nothing later.

- [ ] **Step 1: The parent's step lines.** In the list of step 3's groups, replace the 3b3 and 3b4 items with:

```markdown
- 3b3, the issue editor and the messages: L7 and L8; the editing view, the read
  view being 3b1's heading; the banners' stacking, Dismiss and mounting
  (`docs/superpowers/specs/2026-10-16-ui-refresh-3b3-issue-editor-and-messages-design.md`);
- 3b4, the lobby: L9 and the lobby's messages, the join and create failures and
  "Your session has ended", which show only over the lobby, and the lobby's
  breakpoint.
```

- [ ] **Step 2: Principle 4's table.** In the row "The wide layout otherwise: a longer issue, a notice shown, or below the height floor", replace the last cell `the banners (L8), the issue editor's messages (L7)` with `none: step 3b3`, and in the principle's heading change "(settled; steps 3b1 and 3b2\nreopened its table)" to "(settled; steps 3b1 and 3b2\nreopened its table, and step 3b3 closed its last cell)".

- [ ] **Step 3: 3b1's status.** The Status line gains a second pointer after 3b2's:

```markdown
Status: In discussion; step 3b2 reopens decisions 2, 7, 11 and 13 below its widths
and extends decision 4
(`docs/superpowers/specs/2026-10-15-ui-refresh-3b2-narrow-and-large-design.md`);
step 3b3 settles the banners' and the editor's deferred decisions
(`docs/superpowers/specs/2026-10-16-ui-refresh-3b3-issue-editor-and-messages-design.md`)
```

- [ ] **Step 4: Check.**

```bash
grep -n "3b3's messages\|the banners (L8)" docs/superpowers/specs/2026-09-30-ui-refresh-design.md
```

Expected: no output.

- [ ] **Step 5: Commit.**

```bash
git add docs/superpowers/specs/2026-09-30-ui-refresh-design.md docs/superpowers/specs/2026-10-09-ui-refresh-3b1-wide-room-page-design.md
git commit -m "docs: point the parent and 3b1 at step 3b3 and move the lobby's messages to 3b4"
```

### Task 2: The mockup

**Files:**
- Create (outside the repo): `~/Documents/pointing-poker-3b3/scripts/checks.mjs`
- Modify: `docs/design/room.html`
- Modify: `docs/design/room-cells.html`

**Interfaces:**
- Consumes: the tokens already in `frontend/src/tokens.css` and `colours.css`; no new token.
- Produces, for Task 3: the parameters `edit` (`1`, `saving`) and `message` (`lost`, `restarted`, `moved`, `conflict`, `save-failed`; `ended` removed), and the markup the reference describes: `.issue-edit` holding `.field` (a `textarea`), `.edit-actions`, `.issue-status`.

- [ ] **Step 1: Write the checks.** Create `~/Documents/pointing-poker-3b3/scripts/checks.mjs`:

```js
// Step 3b3's checks on the room mockup: the editing view, its two messages, the banners' order.
import { chromium, firefox } from '/home/lt/work/lunatech/internal/planning_poker/lunatech-pointingpoker/node_modules/playwright/index.mjs'
const base = process.env.PAGE || `file://${process.cwd()}/docs/design/room.html`
const failures = [], errors = []
const check = (ok, what) => { if (!ok) failures.push(what) }
const run = async (name, fn) => { try { await fn() } catch (e) { failures.push(`${name}: ${e.message.split('\n')[0]}`) } }
const open = async (b, w, h, params = {}, page = base) => {
  const p = await b.newPage({ viewport: { width: w, height: h } })
  p.setDefaultTimeout(1500)
  p.on('pageerror', e => errors.push(`${w}x${h} ${new URLSearchParams(params)}: ${e.message}`))
  await p.goto(`${page}?${new URLSearchParams(params)}`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150)
  return p
}
const box = (p, sel) => p.locator(sel).first().boundingBox()
const SAVE = '[aria-label="Save issue"]', CANCEL = '[aria-label="Cancel editing"]'
const both = { message: 'save-failed,conflict' }
const LONG = 'Rework the login page so that a returning user lands on their last room, and keep the room list in sync with the rooms they were invited to since their last visit, including the rooms that were renamed or archived meanwhile by a facilitator'
const b = await chromium.launch()

// 1. The order: field, Save, Cancel, the messages; beside the field wide, below it on a phone; the DOM says the same.
await run('1 order', async () => {
  for (const [w, wide] of [[1280, true], [390, false]]) {
    const p = await open(b, w, 800, both)
    const f = await box(p, '.field'), s = await box(p, SAVE), c = await box(p, CANCEL), r = await box(p, '.issue-status')
    if (wide) check(Math.abs(s.y - f.y) <= 1 && s.x >= f.x + f.width, `1 wide: Save is not beside the field's first line at ${w}`)
    else check(s.y >= f.y + f.height - 1 && Math.abs(s.x - f.x) <= 1, `1 phone: Save is not below the field, at its start, at ${w}`)
    check(c.x >= s.x + s.width && Math.abs(c.y - s.y) <= 1, `1: Cancel does not follow Save on one row at ${w}`)
    check(r.y >= s.y + s.height - 1 && r.y >= f.y + f.height - 1, `1: the messages are not below the field and the buttons at ${w}`)
    const dom = await p.evaluate(sels => {
      const els = sels.map(s => document.querySelector(s))
      return els.every((e, i) => !i || els[i - 1].compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING)
    }, ['.field', SAVE, CANCEL, '.issue-status', '.issue-status .msg button'])
    check(dom, `1: the DOM order is not field, Save, Cancel, messages, Use theirs at ${w}`)
    await p.close()
  }
})

// 2. Names and the always-rendered region.
await run('2 names', async () => {
  const p = await open(b, 1280, 800, both)
  check(await p.getByRole('textbox', { name: 'Current issue' }).count() === 1, '2: no textbox named Current issue')
  check(await p.locator('textarea.field').count() === 1, '2: the field is not a textarea')
  check(await p.getByRole('button', { name: 'Save issue' }).innerText() === 'Save', '2: Save issue does not read "Save"')
  check(await p.getByRole('button', { name: 'Cancel editing' }).innerText() === 'Cancel', '2: Cancel editing does not read "Cancel"')
  check(await p.locator('.issue-status[role="status"]').count() === 1, '2: not one editor region while editing')
  await p.close()
  const r = await open(b, 1280, 800, {})
  check(await r.getByRole('button', { name: 'Edit issue' }).count() === 1, '2: no Edit issue in the read view')
  check(await r.locator('.issue-status[role="status"]').count() === 1 && (await r.locator('.issue-status').innerHTML()) === '', '2: the read view lacks its empty editor region')
  await r.close()
})

// 3. Targets: 44 px for Save, Cancel, Use theirs and Dismiss, in both layouts.
await run('3 targets', async () => {
  for (const w of [1280, 390]) {
    const p = await open(b, w, 800, { ...both, message: 'save-failed,conflict,moved' })
    for (const [what, sel] of [['Save', SAVE], ['Cancel', CANCEL], ['Use theirs', '.issue-status .msg button'], ['Dismiss', '[aria-label="Dismiss"]']]) {
      const x = await box(p, sel)
      check(x.width >= 43.5 && x.height >= 43.5, `3: ${what} is ${x.width}x${x.height} at ${w}`)
    }
    await p.close()
  }
})

// 4. Both messages, a long issue, every width from 320 to 1180: nothing leaves the panel, the whole issue shows.
await run('4 spill', async () => {
  const p = await open(b, 1180, 900, { issue: LONG, message: 'lost,moved,restarted,save-failed,conflict' })
  const fitted = await p.evaluate(() => { const f = document.querySelector('.field'); return f.scrollHeight <= f.clientHeight + 1 })
  check(fitted, '4: the field is not fitted to its text before any resize')
  for (let w = 1180; w >= 320; w -= 4) {
    await p.setViewportSize({ width: w, height: 900 }); await p.waitForTimeout(40)
    const r = await p.evaluate(() => {
      const panel = document.querySelector('.issue-panel').getBoundingClientRect()
      const out = [...document.querySelectorAll('.field, .edit-actions, .issue-status, .issue-status .msg')].filter(e => e.getBoundingClientRect().right > panel.right + 0.5).map(e => e.className)
      const f = document.querySelector('.field')
      return { out, hidden: f.scrollHeight > f.clientHeight + 1 || f.scrollWidth > f.clientWidth + 1, wide: document.documentElement.scrollWidth > document.documentElement.clientWidth }
    })
    check(!r.out.length && !r.hidden && !r.wide, `4 spill at ${w}: ${JSON.stringify(r)}`)
  }
  await p.close()
})

// 5. A one-line issue: the panel is as tall editing as reading on the wide layout.
await run('5 height', async () => {
  const read = await open(b, 1280, 800, { issue: 'PP-1234' }), edit = await open(b, 1280, 800, { issue: 'PP-1234', edit: '1' })
  check(await edit.locator('textarea.field').count() === 1, '5: edit=1 does not draw the editing view')
  const a = (await box(read, '.issue-panel')).height, e = (await box(edit, '.issue-panel')).height
  check(Math.abs(a - e) <= 1, `5: the panel is ${a} px read and ${e} px editing`)
  await read.close(); await edit.close()
})

// 6. Saving: aria-disabled and focusable, not disabled; the field read-only; a look that differs.
await run('6 saving', async () => {
  const p = await open(b, 1280, 800, { edit: 'saving' }), q = await open(b, 1280, 800, { edit: '1' })
  for (const sel of [SAVE, CANCEL]) {
    check(await p.locator(sel).getAttribute('aria-disabled') === 'true', `6: ${sel} is not aria-disabled while saving`)
    check(await p.locator(sel).evaluate(e => e.disabled) === false, `6: ${sel} is natively disabled`)
  }
  check(await p.locator('.field').evaluate(e => e.readOnly) === true, '6: the field is not read-only while saving')
  await p.locator(SAVE).focus()
  check(await p.evaluate(() => document.activeElement.getAttribute('aria-label')) === 'Save issue', '6: Save does not take focus while saving')
  const look = page => page.locator(SAVE).evaluate(e => { const s = getComputedStyle(e); return `${s.color}|${s.backgroundColor}` })
  check(await look(p) !== await look(q), '6: the saving look equals the active look')
  await p.close(); await q.close()
})

// 7. Order by tone: banners by tone whatever the URL names first, the editor's problem above its notice, no role of their own, one string.
await run('7 order', async () => {
  const p = await open(b, 1280, 800, { message: 'restarted,moved,lost' })
  const texts = await p.locator('.messages .msg').allInnerTexts()
  check(texts.length === 3 && /lost/.test(texts[0]) && /old link/.test(texts[1]) && /Reconnected/.test(texts[2]), `7: the banners are not lost, moved, restarted: ${JSON.stringify(texts)}`)
  await p.close()
  const e = await open(b, 1280, 800, both)
  const kinds = await e.locator('.issue-status').evaluate(r => [...r.children].map(c => c.classList.contains('problem') ? 'problem' : 'notice'))
  check(JSON.stringify(kinds) === '["problem","notice"]', `7: the editor's panels are ${kinds}`)
  check(await e.locator('.issue-status [role]').count() === 0, '7: an editor panel has a role of its own')
  const text = (await e.locator('.issue-status').textContent()).replace(/\s+/g, ' ').trim()
  check(text === 'Could not save the issueChanged by someone else to: "PP-1240" Use theirs', `7: the region reads ${JSON.stringify(text)}`)
  await e.close()
})

// 8. Tab from the field: Save, Cancel, Use theirs, in Chromium and Firefox, wide and phone.
await run('8 tab order', async () => {
  for (const browser of [b, await firefox.launch()]) for (const w of [1280, 390]) {
    const p = await open(browser, w, 800, both)
    await p.locator('.field').focus()
    const seen = []
    for (let i = 0; i < 3; i++) { await p.keyboard.press('Tab'); seen.push(await p.evaluate(() => document.activeElement.getAttribute('aria-label') || document.activeElement.textContent.trim())) }
    check(JSON.stringify(seen) === '["Save issue","Cancel editing","Use theirs"]', `8: Tab visits ${JSON.stringify(seen)} in ${browser.browserType().name()} at ${w}`)
    await p.close()
  }
})

// 9. No Session ended; no Messages landmark without a banner.
await run('9 messages', async () => {
  const none = await open(b, 1280, 800, {}), ended = await open(b, 1280, 800, { message: 'ended' })
  check(await none.locator('section[aria-label="Messages"]').count() === 0, '9: an empty Messages section is mounted')
  check(await ended.locator('section[aria-label="Messages"]').count() === 0 && !(await ended.content()).includes('session has ended'), '9: the ended message still draws')
  await none.close(); await ended.close()
})

// 10. The cells page offers the editing cells and no ended option.
await run('10 cells', async () => {
  const p = await open(b, 1400, 900, {}, new URL('room-cells.html', base).href)
  check(await p.locator('input[name="message"][value="ended"]').count() === 0, '10: the cells still offer ended')
  check(await p.locator('input[name="message"][value="conflict,save-failed"]').count() === 1, '10: the cells lack both editor messages')
  await p.check('input[name="edit"][value="saving"]')
  check((await p.locator('iframe').first().getAttribute('src')).includes('edit=saving'), '10: the cells do not pass edit to the page')
  await p.close()
})

// 11. Without field-sizing (Firefox ESR 140) script fits the field: on load, after typing, after a resize.
await run('11 fallback', async () => {
  for (const w of [1000, 392]) {
    const p = await b.newPage({ viewport: { width: w, height: 800 } }); p.setDefaultTimeout(1500)
    await p.addInitScript(() => {
      const s = CSS.supports.bind(CSS); CSS.supports = (...a) => a[0] === 'field-sizing' ? false : s(...a)
      const add = () => { const st = document.createElement('style'); st.textContent = '.field { field-sizing: fixed !important }'; document.documentElement.append(st) }
      if (document.documentElement) add(); else new MutationObserver((_, o) => { if (document.documentElement) { add(); o.disconnect() } }).observe(document, { childList: true })
    })
    await p.goto(`${base}?edit=1&issue=${encodeURIComponent(LONG)}`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150)
    const fits = () => p.locator('.field').evaluate(f => ({ fixed: getComputedStyle(f).fieldSizing === 'fixed', ok: f.scrollHeight <= f.clientHeight + 1, lines: f.clientHeight }))
    let r = await fits(); check(r.fixed, `11: the fallback is not isolated at ${w}`); check(r.ok && r.lines > 90, `11: not fitted on load at ${w}: ${JSON.stringify(r)}`)
    await p.locator('.field').fill(`${LONG} ${LONG}`); r = await fits(); check(r.ok, `11: not fitted after typing at ${w}`)
    await p.setViewportSize({ width: 560, height: 800 }); await p.waitForTimeout(150); r = await fits(); check(r.ok, `11: not fitted after a resize from ${w}`)
    await p.close()
  }
})

await b.close()
for (const e of errors) failures.push(`page error ${e}`)
console.log(failures.length ? failures.join('\n') : 'every check passes')
process.exit(failures.length ? 1 : 0)
```

- [ ] **Step 2: Run it on today's mockup, to see it fail.**

Run: `node ~/Documents/pointing-poker-3b3/scripts/checks.mjs`
Expected: exit 1, with a failure from every check numbered 1 to 10 (the `.field`, `.edit-actions` and `edit` do not exist; `ended` still draws).

- [ ] **Step 3: The parameters and the banners.** In `docs/design/room.html`:
  - Replace both `<title>`s' "steps 3b1 and 3b2" with "steps 3b1 to 3b3" (`room.html` here, `room-cells.html` in Step 5).
  - Replace the parameter comment's `message (a comma list of lost, ended, restarted, moved, conflict, save-failed),` with:

```
message (a comma list of lost, restarted, moved, conflict, save-failed), edit (1: the editing view; saving: its saving look; conflict and save-failed imply 1),
```

  - Replace the `msg` helper and delete the `ended` banner:

```js
const msg = (tone, text, dismiss, live = true) => `<div class="msg ${tone}"${live ? ` role="${tone === 'problem' ? 'alert' : 'status'}"` : ''}>${tone === 'problem' ? alertIcon : infoIcon}<p>${text}</p>${
  dismiss ? `<button class="quiet" type="button" aria-label="Dismiss">${close}</button>` : ''}</div>`
```

  and from `const banners = {` remove the line `  ended: msg('problem', 'Your session has ended. Please reload the page to rejoin.'),`.

  - Replace the banner list so the stack follows the tone, not the URL (3b3 decision 3):

```js
  const bannerList = ['lost', 'moved', 'restarted'].filter(m => messages.includes(m)).map(m => banners[m]).join('')
```

- [ ] **Step 4: The editing view.** In `room.html`:
  - Replace the block from `/* The editing view is 3b3's, drawn dashed only to hold its messages */` to the closing brace of `.issue-edit input { … }` with:

```css
  /* 3b3: the editing view (decisions 7 to 11): the field, Save and Cancel, then the messages; the buttons beside the field here, below it on a phone */
  .issue-edit { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: var(--space-3); align-items: start; }
  .issue-edit > .field, .edit-actions { margin-block: calc(-1 * (var(--panel-inline) - var(--space-2))); }   /* as Edit: the panel keeps its read height */
  .field {
    display: block; width: 100%; min-height: var(--target-min); resize: none; overflow: hidden; overflow-wrap: anywhere;
    field-sizing: content;   /* grows with its wrapped text, so the whole issue stays visible (decision 7) */
    font: var(--weight-strong) var(--text-lg)/var(--leading-tight) var(--font-sans); color: var(--ink); background: var(--paper-warm);
    padding-inline: var(--space-2); padding-block: calc((var(--target-min) - var(--text-lg) * var(--leading-tight)) / 2 - var(--line-control));
    border: var(--line-control) solid var(--mute-soft); border-radius: var(--radius-card);
  }
  .edit-actions { display: flex; gap: var(--space-2); }
  .edit-actions .btn { display: flex; align-items: center; justify-content: center; gap: var(--space-2); min-width: var(--target-min); padding-inline: var(--space-3); }
  .edit-actions .btn svg { display: block; }
  /* The one editor region, always rendered; its panels clear the field's overhang and lose the banners' shadow */
  .issue-status { display: flex; flex-direction: column; gap: var(--space-2); grid-column: 1 / -1; }
  .issue-status:not(:empty) { margin-top: var(--panel-inline); }
  .issue-status .msg { box-shadow: none; }
  /* While saving: aria-disabled keeps focus, the look says a save is in flight (decision 10) */
  .edit-actions [aria-disabled="true"] { cursor: default; }
  .edit-actions .btn.primary[aria-disabled="true"] { background: var(--track); color: var(--grey); }
  .edit-actions .btn.secondary[aria-disabled="true"] { border-color: var(--hairline-colour); color: var(--grey); }
```

  - In the same `<style>`, make Dismiss and Use theirs reach the target: replace `.msg .quiet { color: inherit; padding: var(--space-2); }` with:

```css
  .msg .quiet { color: inherit; padding: var(--space-2); min-width: var(--target-min); justify-content: center; }
```

  - In the phone block (`@container page (width < 51.75rem) {`), after `.issue-panel { order: 1; }` add:

```css
    /* 3b3: Save and Cancel below the field, at its start (decision 8) */
    .issue-edit { grid-template-columns: minmax(0, 1fr); }
    .issue-edit > .field, .edit-actions { margin-block: 0; }
    .edit-actions { margin-top: var(--space-2); }
    .issue-status:not(:empty) { margin-top: var(--space-2); }
```

  - In the pinned-sheet rule, change `.issue-panel :is(a, button, input)` to `.issue-panel :is(a, button, input, textarea)`.
  - Replace the `editorMsg` and `issueBlock` definitions with:

```js
  const saving = q.get('edit') === 'saving'
  const editing = saving || q.get('edit') === '1' || messages.includes('conflict') || messages.includes('save-failed')
  const failure = messages.includes('save-failed') ? msg('problem', 'Could not save the issue', false, false) : ''
  const conflict = messages.includes('conflict') ? msg('notice', 'Changed by someone else to: "PP-1240" <button class="quiet" type="button">Use theirs</button>', false, false) : ''
  const status = `<div class="issue-status" role="status">${failure}${conflict}</div>`
  const aria = saving ? ' aria-disabled="true"' : ''
  const issueBlock = editing
    ? `<section class="panel issue-panel"><div class="issue-edit"><textarea class="field" rows="1" aria-label="Current issue" enterkeyhint="done"${saving ? ' readonly' : ''}>${issue}</textarea>
      <div class="edit-actions"><button class="btn primary" type="button" aria-label="Save issue"${aria}>${icon('M5 12l5 5L20 7')}<span class="word">Save</span></button><button class="btn secondary" type="button" aria-label="Cancel editing"${aria}>${close}<span class="word">Cancel</span></button></div>${status}</div></section>`
    : `<section class="panel issue-panel"><div class="issue"><h2${issue ? '' : ' class="empty"'}>${issue ? issueHtml : 'No issue yet'}</h2><button class="quiet" type="button" aria-label="Edit issue">${pencil}Edit</button></div>${status}</section>`
```

  - Enter saves in the real editor and never inserts a line break (decision 7); the mockup has no save, so it only blocks the break. After the existing `keydown` listener on `document` add:

```js
document.addEventListener('keydown', e => e.key === 'Enter' && e.target.matches('.field') && e.preventDefault())
```

  - Firefox ESR 140 lacks `field-sizing`, so the field would stay one row there; a script fits it where the CSS does not. Define it with the other top-level functions, before `draw()` first runs:

```js
// Without field-sizing (Firefox ESR 140) script sets the field's height from its text.
const nativeGrow = CSS.supports('field-sizing', 'content')
function fitField() {
  const f = document.querySelector('.field')
  if (nativeGrow || !f) return
  f.style.height = 'auto'; f.style.height = `${f.scrollHeight + f.offsetHeight - f.clientHeight}px`
}
let fitQueued = false   // resize and font events fit once per frame; a fit forces a full layout
const fitSoon = () => { if (!fitQueued) { fitQueued = true; requestAnimationFrame(() => { fitQueued = false; fitField() }) } }
document.addEventListener('input', e => e.target.matches('.field') && fitField())
window.addEventListener('resize', fitSoon)
document.fonts.addEventListener('loadingdone', fitSoon)
```

  and call `fitField()` at the end of `draw()`, after `watched.disconnect(); watched.observe(document.querySelector('.people'))`.

- [ ] **Step 5: The cells.** In `docs/design/room-cells.html`:
  - In `options.message`, delete `['ended', 'Session ended']` and, after `['conflict', …]`, add `['conflict,save-failed', 'Both editor messages']`.
  - After the line of `options` that ends `['save-failed', 'Issue save failed (editor)']],` (the second line of `message:`), add the option group:

```js
  edit: [['', 'Reading'], ['1', 'Editing'], ['saving', 'Saving']],
```

  - In its `<title>`, replace "steps 3b1 and 3b2" with "steps 3b1 to 3b3".
  - In `state`, add `edit: ''`; in `render()`'s `src`, add `&edit=${state.edit}` after `&message=${state.message}`.

- [ ] **Step 6: Run the checks, to see them pass.**

Run: `node ~/Documents/pointing-poker-3b3/scripts/checks.mjs`
Expected: `every check passes`, exit 0. If check 5 fails, the editing view's panel differs from the read view's: adjust only the negative margin's expression in `.issue-edit > .field, .edit-actions` until the heights agree, then say so in the commit body.

- [ ] **Step 7: The product owner's look.** Open `docs/design/room-cells.html` in a browser, choose Editing, then Saving, then "Both editor messages", at the widths 1280 and 392. Expected: the buttons beside the field wide and below it on the phone, the problem above the notice, Save and Cancel muted while saving. The product owner judges these cells; do not commit before the user has looked.

- [ ] **Step 8: Commit.**

```bash
git add docs/design/room.html docs/design/room-cells.html
git commit -m "docs: draw the issue editor's editing view and the messages in the room mockup (ui refresh step 3b3)"
```

### Task 3: The reference and the known issues

**Files:**
- Modify: `docs/design/ui-reference.md`
- Modify: `docs/known-issues.md`

**Interfaces:**
- Consumes: Task 2's parameters and markup.
- Produces: nothing later.

- [ ] **Step 1: J6's sentence.** In J6, replace "How they\nstack and their Dismiss are 3b3's." (the line breaks after "How they") with "Their stacking, Dismiss and\nmounting are J12's."

- [ ] **Step 2: A new J12.** After J11's last bullet (the one ending "(3b1 decision 2). … a container query reads the root."), before the next `##` heading, add:

```markdown
### J12. The issue editor and the messages

Step 3b3's spec holds its rules,
`docs/superpowers/specs/2026-10-16-ui-refresh-3b3-issue-editor-and-messages-design.md`,
and `room.html` draws them (`edit=1`, `edit=saving`, and `message` with
`conflict` and `save-failed`).

- **The banners** stack by tone: the lost connection, then the moved link, then
  the restart. Only the notices have a Dismiss, an × alone named "Dismiss" at
  the panel's right, which moves focus to the page's `h1` (`tabindex="-1"`, so it
  takes focus without joining the tab order). The Messages section mounts only
  while a banner shows.
- **The editing view** is a wrapping `<textarea>` at `--text-lg` named "Current
  issue", which grows to fit. Enter saves and never inserts a line break;
  `oneLine` keeps the draft to one line. Save and Cancel, icon and word, sit
  beside the field in the wide layout and below it in the phone layout, in the
  DOM order field, Save, Cancel, messages at every width. When the editing view
  closes (Escape, Cancel, a save that succeeded), focus returns to Edit if it was
  inside the panel or had dropped; focus the user moved elsewhere is left alone.
- **While saving**, Save and Cancel are `aria-disabled`, keep focus and look
  muted; the field is read-only. After a failure the field takes focus only if
  focus fell to the page.
- **The editor's two messages** are message panels under the buttons, inside
  the editor region (step 1a's `issue-status`, always rendered and never
  `display: none`), the problem above the notice, with no role of their own.
```

- [ ] **Step 3: Open.**
  - Replace the settled paragraph (it begins "L1 to L4, L6, L5's card size") with: "L1 to L4, L6, L5's card size and L11's breakpoint for the room page are settled by 3b1 (J10), L5, L10 and L11 for the room page by 3b2 (J11), and L7 and L8 by 3b3 (J12).", wrapped as the file wraps it.
  - Delete the **L7** and **L8** bullets; keep L8's last sentence (a banner arriving on a scrolled page stays above the view, by the browser's scroll anchoring, 3b1 decision 3) as the last bullet of J12.
  - Replace the **L9** bullet with:

```markdown
- **L9. The lobby** (3b4), with the lobby's messages: the join and create
  failures and "Your session has ended", which show only over the lobby (3b3
  decision 1), and the lobby's own `h1`, where Dismiss's focus lands.
```

- [ ] **Step 4: The decisions log.** After the **3b2** entry add:

```markdown
- **3b3.** The issue editor and the messages came with their own spec,
  `docs/superpowers/specs/2026-10-16-ui-refresh-3b3-issue-editor-and-messages-design.md`.
  The lobby's messages (the join and create failures, "Your session has
  ended") are 3b4's: each shows only over the lobby, which the product owner
  judges there. The stack follows the tone, as today's order did, with no
  arrival tracked; the editor's messages follow it too, the problem above the
  notice, where step 1a's code had the notice first by no rule. The field is a
  wrapping textarea so the whole issue stays visible, with Enter saving and a
  `oneLine` draft; Save and Cancel are beside it where Edit was and below it
  on a phone, where 360 to 430 px left the field 178 to 248 px beside them.
  Saving keeps focus on the buttons (`aria-disabled`), which closes the Save
  button's screen reader issue. Set aside: Dismiss on problems, and an
  always-rendered Messages section, which nothing today needs; the next
  banner's Dismiss as the focus target, dead outside a typed URL; a one-line
  input and a two-line capped field; the buttons below the field at every
  width, or beside it at every width; the editor's messages as banners in the
  Messages section, or as plain text under the field; and the notice above the
  problem.
```

- [ ] **Step 5: The Mockups list.** In `## Mockups`, the `room.html` bullet:
  - change "(J10, J11)" to "(J10, J11, J12)";
  - after the parameter `message` and its parenthesis ("today's banners and the editor's messages"), add `edit` (`1` the editing view, `saving` its saving look) as the next item, before `menu`. Keep the line wrapped as the file wraps it.

- [ ] **Step 5b: The contract pointer.** In `## Contract reads the look keeps`, after its first paragraph, add: "Step 3b3's contract changes, for the editing view and the banners, are listed in its spec (`docs/superpowers/specs/2026-10-16-ui-refresh-3b3-issue-editor-and-messages-design.md`, Contract)."

- [ ] **Step 6: Known issues.**
  - In "The issue editor's phone keyboard behaviour is unverified", add to **Issue:** after its last sentence: "Step 3b3 makes Enter always save and never insert a line break (`oneLine` in `room/issueEditor.ts`), so a swallowed Gboard Enter at the end of the draft does nothing, as today, and one inside the text becomes a space and moves the caret to the end." And to **Resolution:**, after "narrow the guard then.": "The narrowing, if needed, is to treat a `beforeinput` of `insertLineBreak` as the save, which a composition commit never produces (inferred, not checked on a phone)."
  - After that entry add a new entry (its **Issue** also names `field-sizing: content`, which Firefox ESR 140 lacks, confirmed, and Safari's support is unchecked, for step 4 to settle):

```markdown
### On a phone, the virtual keyboard and the pinned sheet may leave the editing view little room

- **Where:** the editing view, `docs/design/room.html` (`edit=1`), built in step 4.
- **Issue:** The phone layout pins the sheet to the viewport's bottom, and the
  virtual keyboard rises over it. With the keyboard open, the field, Save and
  Cancel and the editor's messages may have little room to show (inferred, not
  checked on a phone). The mockup's field grows by CSS `field-sizing: content`,
  which Firefox ESR 140 lacks (confirmed by hand); step 4 needs a script fit
  there, as the mockup has, and Safari's support is unchecked.
- **Resolution:** Stays open until a phone is at hand on the deployed app
  (`docs/superpowers/specs/2026-10-16-ui-refresh-3b3-issue-editor-and-messages-design.md`,
  Accepted costs); never a merge gate.
```

  - In "A screen reader does not hear a failed save from the Save issue button", replace the **Resolution:** with: "Decided in step 3b3 (`docs/superpowers/specs/2026-10-16-ui-refresh-3b3-issue-editor-and-messages-design.md`, decision 10) and built in step 4: Save and Cancel are `aria-disabled` while saving and keep focus, and after a failure the field takes focus only if focus fell to the page, so a failure read from the button is not cut off. Remove this entry when step 4 lands it."

- [ ] **Step 7: Check.**

```bash
grep -n "3b3's\.\|(3b3)\|ended" docs/design/ui-reference.md | head
```

Expected: no "3b3's" or "(3b3)" left in J6 or Open; "ended" hits only in J6's table row, the L9 bullet and the log.

- [ ] **Step 8: Commit.**

```bash
git add docs/design/ui-reference.md docs/known-issues.md
git commit -m "docs: give the design reference the issue editor and the messages (ui refresh step 3b3)"
```

### Task 4: Check the branch

- [ ] **Step 1:** no app code or test changed.

```bash
git diff --name-only 4280e62..HEAD | grep -v '^docs/'
```

Expected: no output.

- [ ] **Step 2:** run the checks once more and look at the tree.

```bash
node ~/Documents/pointing-poker-3b3/scripts/checks.mjs && git status --short
```

Expected: `every check passes`, and `git status` shows nothing.

- [ ] **Step 3:** tell the user the branch is ready for review and unpushed; the PR stacked on #448, and the merge stack, are the user's to schedule.
