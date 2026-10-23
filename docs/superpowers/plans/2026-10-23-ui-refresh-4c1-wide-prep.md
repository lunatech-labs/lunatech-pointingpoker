# UI Refresh Step 4c1-wide-prep: The Mockups' Icons and the Avatars' Tokens, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The mockups draw lucide's icons from one shared file that a unit test keeps equal to `lucide-react`, and the roster's 14 avatar pairs become colour tokens that the gate exempts by name.

**Architecture:**
- `docs/design/icons.js` is a classic script that both mockups load before their own script. It holds `icons`, a table of each icon's elements by lucide's name, and `icon(name)`, which draws one as markup.
- `frontend/src/design/icons.test.ts` loads that file through Node's `vm`. It compares each drawing with `lucide-react`'s component rendered by `react-dom/server`.
- `colours.css` gains `--avatar-ink-1` to `--avatar-ink-14` and `--avatar-ground-1` to `--avatar-ground-14`. `room.html`'s `avatar` names them in its inline `--h` and `--t`, and `gate.ts`'s decorative set lists them.

**Tech Stack:** Classic browser scripts opened from `file://`; Vitest under `test:unit` (no DOM); `lucide-react` 1.49.0, `react-dom/server`; the 4c1-mockups diff in Playwright's Chromium.

**Spec:** `docs/superpowers/specs/2026-10-22-ui-refresh-4c1-wide-prep-design.md`. The parent's change it names already landed with the spec's first commit.

## How this plan was verified

- **Probed, 2026-10-23:**
  - A draft `icons.js` was generated from each icon's `__iconData.node`, with `key` dropped.
  - A draft of Task 1's test, reading that file through `vm.runInContext`, passed for all 12 names under `vitest run --root frontend`, and `tsc -p frontend` and `eslint` were clean.
  - It failed in each of the spec's three ways: `eye`'s circle radius edited, the `menu` entry removed, and `stroke-linecap` dropped from the drawing.
  - The probe files were then removed.
- **Checked:**
  - The `lucide-react` package ships `LICENSE`, the ISC notice followed by Feather's MIT notice and its list of icons, `arrow-right`, `check`, `info`, `link`, `log-out`, `trash` and `x` among them.
  - `lucide-react/dynamicIconImports` is typed, so a name outside the package fails `tsc`.
  - `page.css`'s `svg` rule sets each icon's width and height to `--icon`.
  - Nothing else in the mockups is named `icons`.
- **Inferred, and judged by Task 1's diff:** that rule overrides lucide's `width="24"` and `height="24"` attributes, so no icon changes size.

## Rulings this plan makes, for the user's review

- **R1. The table is named `icons` and the drawing function `icon(name)`.** Each mockup drops its own `icon(d)`, since a second top-level `const icon` would throw. Its named constants, such as `alertIcon`, `close` and `pencil`, stay, now calling `icon` with a lucide name, so the templates do not change.
- **R2. The gate's unit case 'include a token added without a pair' takes `--avatar-ink-15` for its `--spare`, with a one-line comment.** As written, no test catches a decorative set that matches the avatars by prefix, which is what decision 5's "by their names exactly" rules out. The renamed token kills that mutation, and the spec's "the gate gains no case" still holds. 'Leave out the decorative set' also gains `--avatar-ink-1` and `--avatar-ground-14` in its fixture, so the unit test fails first.
- **R3. The diff for Task 2 runs from Task 1's tree, so it should print nothing.** The snapshot skips custom properties, so only a change in an avatar's computed `color` or `background-color` would show, such as an index off by one.

## Global Constraints

**Branch and commits:**
- Branch `20260930.ui_refresh_4c1_wide_prep`, stacked on `20260930.ui_refresh_4c1_mockups`. The spec's commits already exist.
- New commits only: no amend, rebase or force-push. Nothing is pushed until the user asks.
- Commit subjects, verbatim, in Conventional Commits:
  - Task 0: `docs: plan the mockups' icons and the avatars' tokens (ui refresh step 4c1-wide-prep)`
  - Task 1: `feat: draw lucide's icons in the mockups (ui refresh step 4c1-wide-prep)`
  - Task 2: `feat: move the avatars' colours into the tokens (ui refresh step 4c1-wide-prep)`
  - Task 3, only if a ruling changes a file: `fix: apply the product owner's rulings on the mockups' diff (ui refresh step 4c1-wide-prep)`
- No "Generated with Claude Code" or co-author line.

**Code:**
- Comments are one or two lines, with no em dash.
- Decision 1's names, verbatim: Edit `pencil`, Clear votes `trash`, Copy link `link`, Leave `log-out`, ☰ `menu`, Show votes `eye`, Re-vote `rotate-ccw`, Save `check`, Cancel and Dismiss `x`, a problem `triangle-alert`, a notice `info`, Next issue and the lobby's room row `arrow-right`.
- The brand mark keeps its own SVG, as it does not go through `icon`.
- The mockups still open from a checkout through `file://`, without `npm install`.
- No app file other than `colours.css` and `gate.ts` changes, so the app's look does not change.

**Running:**
- `$W` is a scratch directory outside the repo.
- The diff is 4c1-mockups' `mockdiff.mjs`, the throwaway described by that plan's Task 1 Interfaces block. A copy is kept in this session's scratchpad. Run it without `--with-other`.

**Writing:**
- Cite symbols, case titles and PR numbers, never line numbers.
- No counts of commits, edits, items or lines in docs.
- The spec's Status line stays as it is.

## Review Focus

1. **Each control draws the icon decision 1 names it.** The unit test checks the table, not which name each template asks for. For example, Leave should draw `log-out`, not `log-in`, and Dismiss should draw `x`.
2. **The licence travels whole.** `lucide-LICENSE.txt` should be the package's `LICENSE` byte for byte, Feather's MIT part included, and `icons.js`'s first comment should name it.
3. **`--avatar` stays the avatar's size.** `roster.css` should still read it only for the avatar's box, and read `--h` and `--t` only for its colours.

---

### Task 0: Commit the plan

- [ ] **Step 1: Commit**

```bash
git add docs/superpowers/plans/2026-10-23-ui-refresh-4c1-wide-prep.md
git commit -m "docs: plan the mockups' icons and the avatars' tokens (ui refresh step 4c1-wide-prep)"
```

### Task 1: The icons

**Files:**
- Create: `frontend/src/design/icons.test.ts`, `docs/design/icons.js`, `docs/design/lucide-LICENSE.txt`
- Modify: `docs/design/room.html`, `docs/design/lobby.html`, `docs/design/ui-reference.md` (Mockups)

**Interfaces:**
- Produces:
  - **`icons`,** in `docs/design/icons.js`. It maps each of decision 1's names, in decision 1's order, to lucide's element list: `[tag, attributes]` pairs, with lucide's `key` dropped.
  - **`icon(name: string): string`.** It returns the `<svg>` markup that `renderToStaticMarkup(createElement(LucideIcon))` produces, without the `class` attribute.

- [ ] **Step 1: Record the base and save the "before" tree**

```bash
BASE1=$(git rev-parse HEAD); mkdir -p "$W/t1-before" && git archive "$BASE1" docs/design frontend/src | tar -x -C "$W/t1-before"
```

- [ ] **Step 2: Write the failing test `frontend/src/design/icons.test.ts`**

Its setup:
- It reads `../../../docs/design/icons.js` with `readFileSync(fileURLToPath(new URL(…, import.meta.url)))`, as `tokens.gate.test.ts` reads its files.
- It runs that file in a `vm.createContext()` context, then reads `icons` and `icon` back with `runInContext('icons', context)` and `runInContext('icon', context)`. A top-level `const` is not a property of the context object, but `runInContext` reads it.
- It declares `const names = [<decision 1's names, in its order>] as const satisfies (keyof typeof dynamicIconImports)[]`, imported from `lucide-react/dynamicIconImports`.
- A one-line comment says that a `lucide-react` bump that redraws an icon fails here until `icons.js` follows.

Its cases, in `describe("the mockups' icons")`:

```ts
it('holds exactly the icons the mockups draw', () => {
  expect(Object.keys(icons)).toEqual(names)
})

it.each(names)('draws %s as lucide-react does', async name => {
  const { default: Icon } = await dynamicIconImports[name]()
  expect(icon(name)).toBe(renderToStaticMarkup(createElement(Icon)).replace(/ class="[^"]*"/, ''))
})
```

- [ ] **Step 3: Run it to watch it fail**

Run: `npx vitest run --root frontend src/design/icons.test.ts`
Expected: FAIL, ENOENT for `icons.js`.

- [ ] **Step 4: Write `docs/design/icons.js` and copy the licence**

The file:
- Its first comment says it holds lucide's icons for both mockups, by lucide's name, and that their licence is `lucide-LICENSE.txt` beside it.
- Generate `icons` from each name's `(await dynamicIconImports[name]()).__iconData.node`, with `key` dropped. Don't type it by hand.
- `icon(name)` draws `<svg …>` with lucide's defaults, then each element as `<tag a="v"></tag>`, in the table's order. The test fixes the attributes and their order.

The licence: `cp node_modules/lucide-react/LICENSE docs/design/lucide-LICENSE.txt`.

- [ ] **Step 5: Run it to watch it pass**

Run: `npx vitest run --root frontend src/design/icons.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 6: Prove each of the spec's mutations fails it, then restore**

Each of these fails the test, and the file is restored from git after each:
- an attribute of a copy edited, such as `eye`'s circle `r`, fails 'draws eye as lucide-react does';
- the `menu` entry removed fails 'holds exactly the icons the mockups draw' and 'draws menu as lucide-react does';
- `stroke-linecap="round"` dropped from `icon`'s `<svg>` fails every `draws` case.

Expected: each fails as listed, and `git diff --quiet docs/design/icons.js` after the last restore.

- [ ] **Step 7: Make the mockups load and call it**

- In `room.html` and `lobby.html`, put `<script src="icons.js"></script>` before the inline `<script>`, and delete the inline `const icon = d => …`.
- Each path argument becomes its lucide name, by decision 1:
  - `alertIcon` is `triangle-alert`, `infoIcon` is `info` and `close` is `x`;
  - in `lobby.html`, `arrow` is `arrow-right`;
  - in `room.html`, `pencil`, `trash` and `link` keep their names, and `exit` is `log-out`;
  - the inline calls are `menu` for ☰, `check` for Save, `rotate-ccw` for Re-vote, `eye` for Show votes and `arrow-right` for Next issue.
- After this, `grep -n "icon('M" docs/design/*.html` prints nothing.

- [ ] **Step 8: Diff the mockups against the "before" tree**

Run: `node $W/mockdiff.mjs "$W/t1-before" . > "$W/t1-diff.txt"`, then read it, starting with any `error` line.

Expected:
- no `error` line;
- `unpaired` lines only for elements inside an `<svg>`;
- tally lines only on `svg`, `path` or `circle`, where `stroke-linecap` and `stroke-linejoin` become `round`, and `d`, `cx`, `cy` and `r` change.

Keep `$W/t1-diff.txt` for Task 3.

- [ ] **Step 9: Open both mockups in Firefox from `file://`**

For each of `room.html`, `room.html?edit=1&message=lost,restarted` and `lobby.html?message=join-failed`, open the page from `file://` in Playwright's Firefox.

Expected: no page error, and every `svg` outside `.brand-logo` has at least one child.

- [ ] **Step 10: The reference's Mockups section names the file**

After the `lobby-cells.html` bullet, add one bullet:
- `icons.js` holds the icons both mockups draw, lucide's, copied from `lucide-react` by name.
- `frontend/src/design/icons.test.ts` keeps it equal to the package.
- Lucide's licence sits beside it as `lucide-LICENSE.txt`.

- [ ] **Step 11: Run the unit suite and commit**

Run: `npm run test:unit && npm run typecheck && npm run lint`
Expected: all pass.

```bash
git add frontend/src/design/icons.test.ts docs/design/icons.js docs/design/lucide-LICENSE.txt docs/design/room.html docs/design/lobby.html docs/design/ui-reference.md
git commit -m "feat: draw lucide's icons in the mockups (ui refresh step 4c1-wide-prep)"
```

### Task 2: The avatar tokens

**Files:**
- Modify: `frontend/src/colours.css`, `frontend/src/design/gate.ts`, `frontend/src/design/gate.test.ts`, `docs/design/room.html`, `docs/design/ui-reference.md` (J8, Tokens)

**Interfaces:**
- Consumes: Task 1's tree, as the diff's "before" tree.
- Produces:
  - **`--avatar-ink-N` and `--avatar-ground-N`, for N from 1 to 14,** in `colours.css`. 4c1-wide's `Roster` reads them (its decision 6).

- [ ] **Step 1: Record the base and save the "before" tree**

```bash
BASE2=$(git rev-parse HEAD); mkdir -p "$W/t2-before" && git archive "$BASE2" docs/design frontend/src | tar -x -C "$W/t2-before"
```

- [ ] **Step 2: Change the gate's unit fixtures (R2)**

In `gate.test.ts`'s `describe` of `unreached`:
- 'leave out the decorative set' adds `--avatar-ink-1: #6D28D9; --avatar-ground-14: #E2E8F0;` to its `decorative` string.
- 'include a token added without a pair' uses `--avatar-ink-15: #000000;` in place of `--spare`, expecting `['--avatar-ink-15']`. Its one-line comment says the name is an avatar's, so the set must list the avatars by name.

- [ ] **Step 3: Add the tokens to `colours.css`**

- They go at the end of `:root`, after `--lift-colour`, as `--avatar-ink-1`, `--avatar-ground-1` and so on to `--avatar-ground-14`.
- The values come from `room.html`'s `hues`, in its order: the first of each pair is the initials, the second their ground.
- A one-line comment opens the run, saying these are the roster's avatars, initials on their ground, decorative, picked by a hash of the name.

- [ ] **Step 4: Run the gate to watch it fail**

Run: `npx vitest run --root frontend src/design/gate.test.ts src/design/tokens.gate.test.ts`
Expected: FAIL in two cases, and only these:
- 'leave out the decorative set', returning `['--avatar-ink-1', '--avatar-ground-14']`;
- 'reaches every colour token but the decorative set', returning the 28 new names.

- [ ] **Step 5: Add the avatars to `gate.ts`'s `decorative` set, by name**

- Build the names from 1 to 14, as `--avatar-ink-${n}` and `--avatar-ground-${n}`, and spread them into the set.
- The set's comment names the avatars' incidental initials (J8), beside J9's hairlines and shadows.

- [ ] **Step 6: Run the gate to watch it pass, then prove the prefix mutation fails it**

Run the Step 4 command. Expected: PASS.

Then replace the set's test with `name.startsWith('--avatar-')`, and run again. Expected: FAIL in 'include a token added without a pair'. Restore it.

- [ ] **Step 7: `room.html`'s `avatar` names the tokens**

- `hues` goes, replaced by the pairs' count, 14.
- `avatar(n)` takes `i = hash(n) % 14 + 1` and sets `--h:var(--avatar-ink-${i});--t:var(--avatar-ground-${i})`.
- `hash` and `initials` are unchanged. The `// I: soft avatars` comment says the pair now comes from the tokens.

- [ ] **Step 8: Diff the mockups against Task 1's tree**

Run: `node $W/mockdiff.mjs "$W/t2-before" . > "$W/t2-diff.txt"`
Expected: the file is empty, as R3 says.

- [ ] **Step 9: The reference's J8 and Tokens**

- **J8:** the sentence "So are the roster's avatars, … carries the information." is kept, and this follows it: "The set lists their tokens by name, `--avatar-ink-1` to `--avatar-ink-14` and `--avatar-ground-1` to `--avatar-ground-14`, so a later avatar token is not exempt by its prefix."
- **Tokens,** the Colour row: after "…the header mark's offset and the shadows' colours", add "; from 4c1-wide-prep, the avatars' pairs".

- [ ] **Step 10: Run the unit suite and commit**

Run: `npm run test:unit && npm run typecheck && npm run lint`
Expected: all pass.

```bash
git add frontend/src/colours.css frontend/src/design/gate.ts frontend/src/design/gate.test.ts docs/design/room.html docs/design/ui-reference.md
git commit -m "feat: move the avatars' colours into the tokens (ui refresh step 4c1-wide-prep)"
```

### Task 3: The product owner's judgment

- [ ] **Step 1: Summarise the diffs for the product owner**

Read `$W/t1-diff.txt`, and group its lines by property and element. Present:
- the groups;
- any line outside Task 1 Step 8's expected set;
- `$W/t2-diff.txt` being empty.

- [ ] **Step 2: Have both mockups judged by eye**

Give the product owner the commands to open each page, such as `! xdg-open docs/design/room.html` and `docs/design/room-cells.html`, with the parameters that show every icon: `edit=1`, `menu=1`, `later=1`, `phase=revealed`, and `message=lost,restarted` on both pages.

- [ ] **Step 3: Apply the rulings**

If a ruling changes a file, apply it, run Task 2 Step 10's command, and commit with Task 3's subject. If none does, nothing is committed.
