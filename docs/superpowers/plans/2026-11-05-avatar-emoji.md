# Avatar Emoji Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A roster avatar always draws as one clean line inside its disc.

**Architecture:** `initials` in `avatar.ts` draws the first pick alone when an emoji pick is among the first two words' picks. `.roster-avatar` stops wrapping and clips at the circle. One e2e case reads both CSS rules through a new avatar test id.

**Tech Stack:** React 19 + TypeScript 5.9, Vitest, Playwright (Chromium and Firefox).

**Spec:** `docs/superpowers/specs/2026-11-05-avatar-emoji-design.md`

## Global Constraints

- Emoji pick: `/\p{Extended_Pictographic}|\p{Regional_Indicator}/u` tested on a pick.
- `first` and the split into words (`/[\s-]+/`, first two words) are unchanged.
- `.roster-avatar` gains `white-space: nowrap` and `overflow: clip`; never `overflow: hidden`.
- The avatar span gains `data-testid="avatar"` and keeps `aria-hidden="true"`.
- Browser checks run in both Chromium and Firefox.
- Comments: one or two lines each.

## Rulings

1. **Case of the lone pick.** The lone pick is uppercased like a pair, so `anas 🤖` gives `A` as `ivan` gives `I`; uppercasing an emoji changes nothing. The simpler-looking alternative, returning the pick raw, would make the case depend on whether an emoji follows.
2. **Shape of the code.** Pick the list to join, then join and uppercase once: `(hasEmoji ? picks.slice(0, 1) : picks).join('').toUpperCase()`. No separate branch returns.
3. **Unit table.** One `it.each` over the spec's Behaviour table plus ruling 1's row, named `'%s gives %s'`, beside the existing cases. The three emoji cases are rewritten in place (spec, Verification).
4. **Fixture helper.** `avatar(page, name)`: Participants complementary, `listitem` filtered by `hasText: name`, then `getByTestId('avatar')`. A substring match is enough: the case's names share no substring.
5. **Where the e2e case lives.** A new top-level test in `e2e/layout.spec.js`, which holds the geometry cases. One page joins as `Alice`; `voters(['王 小明', 'Ǆemal Ǳonić'])` adds the two names without browsers. Default viewport.
6. **Settling before reads.** Wait for `document.fonts.ready` and two frames before measuring, as `sideways` in `layout.spec.js` does, since Inter must have drawn `ǄǱ`.
7. **CSS comment.** One line beside `overflow: clip`: `/* clip, not hidden: hidden makes the disc a scroll container */`. The simpler alternative is no comment, but `hidden` is the reflex fix and spec decision 4 exists to stop it.
8. **Mockup check.** `room.html`'s `initials` is checked by pasting it into `node -e` against the Behaviour table, not by hand in a browser: the mockup has no control to rename a person.
9. **Delivery.** One PR, docs folded in. Commits follow the tasks.

## Review Focus

1. A lowercase name before an emoji, `anas 🤖`, shows `A`, not `a`. Test: ruling 1's row in Task 1's table.
2. A skin-toned emoji first, `👍🏽 Bob`, is drawn whole, tone included. Test: a row in Task 1's table, `👍🏽 Bob` gives `👍🏽`.
3. An emoji in the third word does not change the disc: `A B 🤖` gives `AB`. Test: the spec's table row.
4. A text-style pictograph without VS16 (`☺ Bob`) counts as an emoji pick and is drawn alone. Not tested: it is the regex's documented meaning (spec, accepted corners for `©`).
5. An empty or all-space name gives `''` and does not throw on the emoji path. Not tested: `some` on no picks is false, so it joins nothing as today; the lobby refuses such names.

---

### Task 1: The rule, its tests and the mockup

**Files:**
- Modify: `frontend/src/room/avatar.ts`
- Test: `frontend/src/room/avatar.test.ts`
- Modify: `docs/design/room.html` (its `graphemes` and `initials` lines)

**Interfaces:**
- Produces: `initials(name: string): string`, signature unchanged.

- [ ] **Step 1: Rewrite the three emoji cases in place** in `describe('initials')`: `'🦊 Fox'` → `'🦊'`, `'🇫🇷 Marie'` → `'🇫🇷'`, `'🧑‍💻 Dev'` → `'🧑‍💻'`. Names unchanged.
- [ ] **Step 2: Add the table** (ruling 3):

```ts
it.each([
  ['Marie Curie', 'MC'], ['王 小明', '王小'], ['(Bob) Smith', '(S'], ['A B 🤖', 'AB'],
  ['1️⃣ Bob', '1️⃣B'], ['A.N.A.S. 🤖', 'A'], ['Marie 🇫🇷', 'M'], ['(Bob) 🤖', '('],
  ['© Corp', '©'], ['🤖 Anas', '🤖'], ['🍕 🎉', '🍕'], ['🦄', '🦄'],
  ['anas 🤖', 'A'], ['👍🏽 Bob', '👍🏽'],
])('%s gives %s', (name, want) => expect(initials(name)).toBe(want))
```

- [ ] **Step 3: Run and see them fail.** `npm run test:unit -- src/room/avatar.test.ts`. Expected: the three rewritten cases and every row with two picks and an emoji pick fail; the others pass.
- [ ] **Step 4: Implement** in `avatar.ts`: a module constant `emoji` holding the Global Constraints regex, and `initials` per ruling 2. The comment above `first` becomes two lines: `// A word's first grapheme, so an emoji or a flag is drawn whole.` and `// An emoji pick in the first two words leaves the first pick alone, so the disc holds one line.`
- [ ] **Step 5: Run and see them pass**, same command. Expected: all pass.
- [ ] **Step 6: Prove the rule can fail.** Drop `|\p{Regional_Indicator}` from the regex: `Marie 🇫🇷` and the flag case go red. Then make `initials` always join both picks: every row with two picks and an emoji pick goes red. Revert both.
- [ ] **Step 7: Mockup.** In `room.html`, add `const emoji = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u` after the `graphemes` line, and make its `initials` follow ruling 2 with its existing inline grapheme expression. The trailing comment on the `graphemes` line becomes `// a word's first grapheme keeps an emoji whole; an emoji pick is drawn alone`. Check it per ruling 8: every table row of Step 2 gives its expected value.
- [ ] **Step 8: Gates.** `npm run test:unit && npm run typecheck && npm run lint`. Expected: clean, all pass.
- [ ] **Step 9: Commit** `feat: draw an emoji pick alone in a roster avatar`.

### Task 2: The CSS, the test id and the browser checks

**Files:**
- Modify: `frontend/src/components/roster.css` (`.roster-avatar`)
- Modify: `frontend/src/components/Roster.tsx` (`Row`'s avatar span)
- Modify: `e2e/fixtures.js` (new helper after `facilitatorName`)
- Test: `e2e/layout.spec.js`
- Modify: `docs/design/ui-reference.md` ("Contract reads the look keeps")

**Interfaces:**
- Produces: `avatar(page, name)` in `e2e/fixtures.js`, a Playwright locator (ruling 4), with the comment `// A person's avatar in the roster, found through the row holding their name.`

- [ ] **Step 1: Test id and helper.** Add `data-testid="avatar"` to the avatar span; add `avatar` to `fixtures.js`.
- [ ] **Step 2: Write the case** `'a roster avatar draws on one line and is clipped at its disc'` (ruling 5), after the `sideways` helper and outside the narrow describes (they skip Firefox), with `avatar` added to the imports. Wait for both avatars to be visible, then settle (ruling 6). Two reads, each on its avatar via `evaluate`, using a `Range` over the span's contents:
  - `王 小明`: the set of `Math.round(rect.top)` over `range.getClientRects()` has size 1. Message `'王小 on one line'`.
  - `Ǆemal Ǳonić`: with `r = range.getBoundingClientRect()` and `d = el.getBoundingClientRect()`, `hit = document.elementFromPoint(r.right - 1.5, d.top + d.height / 2)`; return `{ inView: hit !== null, self: hit === el }`. Expect `{ inView: true, self: false }`. Message `'ǄǱ cut at the circle'`.
- [ ] **Step 3: Run it red.** `npm run e2e -- layout -g "roster avatar"`. Expected: red in both browsers (Firefox stops at the one-line read; Step 6 shows each read red alone).
- [ ] **Step 4: Add the CSS** to `.roster-avatar`: `white-space: nowrap;` and `overflow: clip;` with ruling 7's comment.
- [ ] **Step 5: Run it green**, same command. Expected: pass in both.
- [ ] **Step 6: Prove each read can fail.** Remove `nowrap` alone: Firefox's one-line read goes red. Restore it; remove `overflow: clip` alone: the clip read goes red in both. Restore.
- [ ] **Step 7: Contract pointer.** In `ui-reference.md`, after the tied vote's paragraph, add: ``The avatar's contract changes, for its test id and the reads on its text, are listed in its spec (`docs/superpowers/specs/2026-11-05-avatar-emoji-design.md`, Contract).``
- [ ] **Step 8: Full gates.** `npm run test:unit && npm run typecheck && npm run lint && npm run e2e`. Expected: all pass.
- [ ] **Step 9: Commit** `feat: keep a roster avatar on one line inside its disc`.

### Task 3: Wrap-up

- [ ] **Step 1: Re-check citations** in every file the branch changed (`git diff --name-only main...`), verifying each claim, not just its line.
- [ ] **Step 2: PR.** Use superpowers:finishing-a-development-branch. Title "Draw a roster avatar on one line"; the body links `Closes #550`.
