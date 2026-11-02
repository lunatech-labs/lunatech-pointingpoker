# UI Refresh Step 3a2: The Root Follows the Height, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the room page's tokens from the mockup to the value source, and make the contrast gate check them.

**Architecture:**
- Two commits after the spec's, as its "Branches and commits" lists:
  - commit 2 (Tasks 1 and 2): the gate's tests and code, then `colours.css`, `tokens.css` and `room.html`, together, since the real-file test passes with neither alone;
  - commit 3 (Task 3): the design reference, 3b1's figures and `contrast.test.ts`'s Brand source figures.
- Tasks 1 and 2's code ran in a dry run on a scratch worktree on 2026-10-14: the final counts, the before and after failures, the style check's output and the figures are that run's; the counts between steps follow from it.

**Tech Stack:** TypeScript, Vitest (`npm run test:unit`), postcss and postcss-value-parser (the gate), Playwright's Chromium (the mockup's computed-style check).

**Spec:** `docs/superpowers/specs/2026-10-14-ui-refresh-3a2-root-height-design.md`. Read it first: its Terms (the block, the decorative set) and decisions 1 to 6 are what this plan carries out. 3a's Terms (value source, pair, vision, gate) are in `docs/superpowers/specs/2026-10-07-ui-refresh-3a-tokens-design.md`.

## Global Constraints

- Commit messages are the spec's, verbatim, in Conventional Commits; never add a generated-with or co-authored-by line.
- Code and CSS comments are one or two lines.
- New commits only: no amend, rebase or force-push; push nothing, as the user pushes.
- Decision 6's values, exactly: `--burgundy` `#9B1A24`, `--burgundy-deep` `#931822`, `--ok` `#0F5D2C`, `--kept` `#7F3A07`, `--bar-other` `#DE656D`.
- Every other value is the block's, as PR #445 delivers it (the "3a2's tokens" `:root` rule in `docs/design/room.html`), but decision 2's shadows.
- In docs, cite a PR number or a main commit, never a branch's commit hash: the repo deletes branches on merge.

## Review Focus

1. A use that writes `var(--shadow)` without `var(--shadow-colour)` is valid CSS and draws in `currentColor`; every shadow use in `room.html` must carry its colour (Task 2, Step 6).
2. A value mis-copied in the move would change the mockup silently; its computed styles may differ only by decision 6's colours and the soft shadow above a 16 px root (Task 2, Step 7).
3. A root in another case or spacing must pass, and one with `min()`'s terms swapped must fail, so `a` is always the `vh` term (Task 1, Step 5).
4. A unit that is an `Object` prototype key, such as `1constructor`, must be reported, not throw; `unitOnlyOn` is a `Map` for that reason (Task 1, Step 1).
5. A figure the reference states must be the one `contrast.ts` computes (Task 3, Step 1).

---

### Task 1: The gate

**Files:**
- Modify: `frontend/src/design/gate.ts`
- Test: `frontend/src/design/gate.test.ts`, `frontend/src/design/tokens.gate.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `pairs(run)` with 3a2's rows; `unreached(runs)` exempting the decorative set; `tokenProblems` reading `unitOnlyOn` as a `Map<string, readonly string[]>`; `rootProblems` reading `clamp(<min>rem, min(<a>vh, <c>vw) + <b>rem, <max>rem)`. Task 2's files must pass them.

No commit in this task: commit 2 holds the gate and the files together (spec, Branches and commits).

- [ ] **Step 1: Write the unit lists' tests (decision 3)**

In `gate.test.ts`, describe `'what tokens.css may hold'`, replace the test `'allows ms, no unit, em on the label tracking, vmin on the root and dvh on the shell'` with:

```ts
  it('allows ms, no unit, em on the label tracking and the tight point, cqi on the value fit, dvh on the shell', () => {
    const fine = '--tracking-label: 0.06em; --tight-point: -0.08em; --value-fit: 66cqi; --b: 180ms; --c: 1.5;'
    expect(problems(`${fine} --d: var(--text-2xl); --shell-height: 100dvh;`)).toEqual([])
  })

  it('allows vh and vw on the root, not vmin', () => {
    expect(problems('--root-size: clamp(1rem, min(1.05vh, 0.82vw) + 0.5rem, 1.75rem);')).toEqual([])
    expect(problems('--root-size: clamp(1rem, 1.05vmin + 0.5rem, 1.75rem);'))
      .toEqual(['--root-size: the unit vmin in clamp(1rem, 1.05vmin + 0.5rem, 1.75rem)'])
  })
```

In the same describe's `it.each` of failures, replace the last row `['--a: 0.12em;', '--a: the unit em in 0.12em']` with:

```ts
    ['--a: 0.12em;', '--a: the unit em in 0.12em'],
    ['--a: 66cqi;', '--a: the unit cqi in 66cqi'],
    ['--a: 1vh;', '--a: the unit vh in 1vh'],
    ['--a: 1constructor;', '--a: the unit constructor in 1constructor']
```

The three new rows pass today; they pin that each list allows its unit on its tokens only, and that a prototype key is reported (Review Focus 4).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --root frontend src/design/gate.test.ts`
Expected: 2 failed, the two tests above (`em` on `--tight-point` and `cqi` on `--value-fit` are refused today; `vmin` on the root is allowed today).

- [ ] **Step 3: Make a unit map to a list of tokens**

In `gate.ts`, replace:

```ts
// J2: the viewport appears only in the root and the shell's height, em only in the label tracking.
const unitOnlyOn: Record<string, string> = { em: '--tracking-label', vmin: '--root-size', dvh: '--shell-height' }
```

with:

```ts
// J2: the viewport appears only in the root and the shell's height; em and cqi follow their text and column.
const unitOnlyOn = new Map<string, readonly string[]>([
  ['em', ['--tracking-label', '--tight-point']],
  ['cqi', ['--value-fit']],
  ['vh', ['--root-size']],
  ['vw', ['--root-size']],
  ['dvh', ['--shell-height']]
])
```

and in `tokenProblems`:

```ts
      if (!allowedUnits.has(lower) && unitOnlyOn[lower] !== name) say(`the unit ${unit.unit}`)
```

with:

```ts
      if (!allowedUnits.has(lower) && !unitOnlyOn.get(lower)?.includes(name)) say(`the unit ${unit.unit}`)
```

Run: `npx vitest run --root frontend src/design/gate.test.ts`
Expected: 70 passed (70). The old root tests still pass, as `rootProblems` still reads `vmin`.

- [ ] **Step 4: Rewrite the root's tests (decision 4)**

Replace the whole describe `"J2's root"` at the end of `gate.test.ts` with:

```ts
describe("J2's root", () => {
  const fine = 'clamp(1rem, min(1.05vh, 0.82vw) + 0.5rem, 1.75rem)'
  const notShape = '--root-size is not clamp(<min>rem, min(<a>vh, <c>vw) + <b>rem, <max>rem)'
  const root = (value: string, more = '') =>
    rootProblems(parseTokens(file(`--root-size: ${value};`, more)))

  it('passes the reference clamp', () => {
    expect(root(fine)).toEqual([])
  })

  it('passes the clamp in any case and spacing a formatter may change', () => {
    expect(root('CLAMP( 1REM , MIN( 1.05VH , 0.82VW ) + 0.5REM , 1.75REM )')).toEqual([])
  })

  it('passes any vw coefficient, since the vw term can only lower the root', () => {
    expect(root('clamp(1rem, min(1.05vh, 50vw) + 0.5rem, 1.75rem)')).toEqual([])
  })

  it.each([
    ['no rem term', 'clamp(1rem, min(2vh, 0.82vw) + 0rem, 1.75rem)', 'the rem term must be above zero'],
    [
      'a maximum above 2.5 times the minimum',
      'clamp(1rem, min(1.05vh, 0.82vw) + 0.5rem, 2.6rem)',
      'the maximum 2.6rem is more than 2.5 times the minimum 1rem'
    ],
    [
      'a malformed number',
      'clamp(1rem, min(1.05vh, 0.82vw) + 0.5rem, 1..75rem)',
      `${notShape}: clamp(1rem, min(1.05vh, 0.82vw) + 0.5rem, 1..75rem)`
    ],
    [
      'a root fluid at the tallest laptop',
      'clamp(1rem, min(1.2vh, 0.82vw) + 0.5rem, 1.75rem)',
      'at a height of 757 px the root is above its minimum'
    ],
    ['the vmin form', 'clamp(1rem, 1.05vmin + 0.5rem, 1.75rem)', `${notShape}: clamp(1rem, 1.05vmin + 0.5rem, 1.75rem)`],
    ['no min()', 'clamp(1rem, 1.05vh + 0.5rem, 1.75rem)', `${notShape}: clamp(1rem, 1.05vh + 0.5rem, 1.75rem)`],
    [
      'the terms of min() swapped',
      'clamp(1rem, min(0.82vw, 1.05vh) + 0.5rem, 1.75rem)',
      `${notShape}: clamp(1rem, min(0.82vw, 1.05vh) + 0.5rem, 1.75rem)`
    ]
  ])('fails on %s', (_, value, problem) => {
    expect(root(value)).toEqual([problem])
  })

  it('fails on a root of another shape', () => {
    expect(root('1rem')).toEqual([`${notShape}: 1rem`])
  })

  it('fails when the root is missing', () => {
    expect(rootProblems(parseTokens(file('--text-md: 1rem;')))).toEqual(['--root-size is missing'])
  })

  it('checks the root the more block sets', () => {
    expect(root(fine, '--root-size: 2rem;')).toEqual([`${notShape}: 2rem`])
  })
})
```

Each old case keeps its rule: no `rem` term (rule 1), the 2.5 bound (rule 2), the tallest laptop (rule 3, `a` = 1.2 gives 1.2 × 7.57 + 8 = 17.08 px, above 16), the malformed number, another shape, the more block.

- [ ] **Step 5: Run them to see them fail**

Run: `npx vitest run --root frontend src/design/gate.test.ts`
Expected: 12 failed | 63 passed (75), every test in `"J2's root"` but `'fails when the root is missing'`: the new shape fails today's `vmin` regex, and the failure messages name the old shape.

- [ ] **Step 6: Read the new root shape**

In `gate.ts`, replace:

```ts
const tallestLaptopVmin = 7.57
const rootShape = new RegExp(
  String.raw`^clamp\(\s*(\d*\.?\d+)rem\s*,\s*(\d*\.?\d+)vmin\s*\+\s*(\d*\.?\d+)rem\s*,\s*(\d*\.?\d+)rem\s*\)$`,
  'i')

// J2's three rules on --root-size in each run, at a default font size of 16 px.
```

with:

```ts
const tallestLaptopVh = 7.57
const number = String.raw`(\d*\.?\d+)`
const rootShape = new RegExp(String.raw`^clamp\(\s*${number}rem\s*,\s*min\(\s*${number}vh\s*,\s*${number}vw\s*\)` +
  String.raw`\s*\+\s*${number}rem\s*,\s*${number}rem\s*\)$`, 'i')

// J2's three rules on --root-size in each run, at a default font size of 16 px; the vw term only lowers it.
```

and in `rootProblems`, three replacements:

```ts
        : `--root-size is not clamp(<min>rem, <a>vmin + <b>rem, <max>rem): ${declared}`)
```
→
```ts
        : `--root-size is not clamp(<min>rem, min(<a>vh, <c>vw) + <b>rem, <max>rem): ${declared}`)
```

```ts
    const [min, a, b, max] = terms.slice(1).map(Number)
```
→
```ts
    const [min, a, , b, max] = terms.slice(1).map(Number)
```

```ts
    if (a * tallestLaptopVmin + b * defaultRoot > min * defaultRoot) {
      problems.push('at a vmin of 757 the root is above its minimum')
```
→
```ts
    if (a * tallestLaptopVh + b * defaultRoot > min * defaultRoot) {
      problems.push('at a height of 757 px the root is above its minimum')
```

Run: `npx vitest run --root frontend src/design/gate.test.ts`
Expected: 75 passed (75).

- [ ] **Step 7: Write the pairs' tests (The pairs, and 3b1 decision 16)**

In describe `'the pairs'`, after the test `'check the hairline in the more run only'`, add:

```ts
  it('hold paper-warm on the card back as an indicator, as the back carries no text', () => {
    const onBack = pairs('base').filter(pair => pair.foreground === '--paper-warm' && pair.ground.token === '--card-back')
    expect(onBack.map(pair => pair.floor)).toEqual([INDICATOR])
  })
```

Replace the describe `'the colour tokens no pair reaches'` in full with the following. Its fixture gains every token the new pairs name, at the block's values with decision 6's, and the unchecked-`var()` case takes a fresh token, `--hairline-strong`, since `--mute-soft` now has its own pairs. The test `'leave out the decorative set'` is Step 10's; it is written now and fails until then.

```ts
describe('the colour tokens no pair reaches', () => {
  const every = [
    '--paper: #FCFAF6; --paper-warm: #FFFFFF; --paper-pale: #F7F5F2; --ink: #1C1917; --grey: #58524F;',
    '--burgundy: #9B1A24; --burgundy-deep: #931822; --burgundy-tint: #FEF3F3; --card-back: #DC2F3C;',
    '--mute-soft: #8A8480; --hairline-strong: #8A8480; --pale: #E7E2DC; --hairline-colour: var(--pale);',
    '--bar-other: #DE656D; --notice-ground: #EEF4FF; --notice-ink: #1E3A8A; --notice-bar: #1D4ED8;',
    '--ok: #0F5D2C; --ok-tint: #F1F9F2; --kept: #7F3A07; --kept-tint: #FAF6EC; --track: #EFEBE7;',
    '--pip: rgba(255, 255, 255, 0.85);'
  ].join(' ')
  const more = '--hairline-colour: var(--hairline-strong);'

  it('are none when each token is in a pair, maybe through var() or the more run', () => {
    expect(unreached(parseColours(file(every, more)))).toEqual([])
  })

  it('leave out the decorative set', () => {
    const decorative = '--mark-offset: #F9C3C6; --shadow-colour: rgba(28, 25, 23, 0.05); --lift-colour: rgba(220, 47, 60, 0.25);'
    expect(unreached(parseColours(file(`${every} ${decorative}`, more)))).toEqual([])
  })

  it('include a token added without a pair', () => {
    expect(unreached(parseColours(file(`${every} --spare: #000000;`, more)))).toEqual(['--spare'])
  })

  it('include a token that only an unchecked var() reaches', () => {
    expect(unreached(parseColours(file(every, '--hairline-colour: #8A8480;')))).toEqual(['--hairline-strong'])
  })
})
```

- [ ] **Step 8: Run them to see them fail**

Run: `npx vitest run --root frontend src/design/gate.test.ts`
Expected: 5 failed | 72 passed (77): `'hold paper-warm on the card back as an indicator…'` (`[7]` against `[3]`), and the four tests of `'the colour tokens no pair reaches'`, each listing `--mute-soft`, `--bar-other` and the other new tokens as unreached.

- [ ] **Step 9: Add 3a2's pairs**

In `gate.ts`, replace:

```ts
const fills: Ground[] = ['--card-back', '--grey', '--burgundy'].map(token => ({ token }))
```

with:

```ts
const fills: Ground[] = ['--grey', '--burgundy'].map(token => ({ token }))
const only = (token: string): Ground[] => [{ token }]
```

and replace the comment and body of `pairs`:

```ts
// The 3a spec's table of pairs; the hairline is an indicator only in the more run.
export const pairs = (run: Run): Pair[] => [
  ...['--ink', '--grey'].flatMap(text => on(text, [...surfaces, ...tints], TEXT)),
  ...on('--burgundy-deep', surfaces.slice(0, 2), INDICATOR),
  ...on('--burgundy-deep', tints, TEXT),
  ...on('--paper-warm', fills, TEXT),
  ...['--card-back', '--burgundy'].flatMap(mark => on(mark, surfaces, INDICATOR)),
  ...(run === 'more' ? on('--hairline-colour', surfaces, INDICATOR) : [])
]
```

with:

```ts
// The 3a and 3a2 specs' tables of pairs; the hairline is an indicator only in the more run.
export const pairs = (run: Run): Pair[] => [
  ...['--ink', '--grey'].flatMap(text => on(text, [...surfaces, ...tints], TEXT)),
  ...on('--burgundy-deep', surfaces.slice(0, 2), INDICATOR),
  ...on('--burgundy-deep', tints, TEXT),
  ...on('--paper-warm', fills, TEXT),
  ...on('--paper-warm', only('--card-back'), INDICATOR),
  ...['--card-back', '--burgundy', '--mute-soft'].flatMap(mark => on(mark, surfaces, INDICATOR)),
  ...on('--bar-other', only('--paper-warm'), INDICATOR),
  ...on('--notice-ink', only('--notice-ground'), TEXT),
  ...on('--notice-bar', only('--notice-ground'), INDICATOR),
  ...on('--ok', only('--ok-tint'), TEXT),
  ...on('--kept', [...only('--kept-tint'), ...surfaces.slice(1)], TEXT),
  ...on('--pip', only('--card-back'), INDICATOR),
  ...on('--card-back', only('--track'), INDICATOR),
  ...(run === 'more' ? on('--hairline-colour', surfaces, INDICATOR) : [])
]
```

`surfaces.slice(1)` is paper-warm and paper-pale, the kept words' other grounds. `--pip` has alpha, and `paint` composites a foreground over its ground already.

Run: `npx vitest run --root frontend src/design/gate.test.ts`
Expected: 1 failed | 76 passed (77), `'leave out the decorative set'`, listing `--mark-offset`, `--shadow-colour` and `--lift-colour`.

- [ ] **Step 10: Exempt the decorative set (decision 5)**

In `gate.ts`, replace:

```ts
// Colour tokens no pair reaches in either run, directly or through var(); --pale is decorative.
```

with:

```ts
// The colours drawn only as a hairline or in a box-shadow, which a reader never needs (J9).
const decorative = new Set(['--pale', '--mark-offset', '--shadow-colour', '--lift-colour'])

// Colour tokens no pair reaches in either run, directly or through var(), but the decorative set.
```

and in `unreached`:

```ts
  return [...runs.more.keys()].filter(name => name !== '--pale' && !reached.has(name))
```

with:

```ts
  return [...runs.more.keys()].filter(name => !decorative.has(name) && !reached.has(name))
```

In `tokens.gate.test.ts`, rename the test `'reaches every colour token but --pale'` to `'reaches every colour token but the decorative set'`.

- [ ] **Step 11: Run the gate's tests**

Run: `npx vitest run --root frontend src/design/gate.test.ts`
Expected: 77 passed (77).

Run: `npx vitest run --root frontend src/design/tokens.gate.test.ts`
Expected: 75 failed | 220 passed (295). The real files fail until Task 2: `Error: --bar-other is not declared` and the like for each new token, and the token and root checks against today's `vmin` root. This is the spec's "they fail until the files move".

---

### Task 2: The value source and the mockup

**Files:**
- Modify: `frontend/src/colours.css`, `frontend/src/tokens.css`, `docs/design/room.html`
- Test: `frontend/src/design/tokens.gate.test.ts` (unchanged since Task 1)

**Interfaces:**
- Consumes: Task 1's gate.
- Produces: the value source the mockup links, and that step 4 imports.

- [ ] **Step 1: Keep a copy of the mockup as it is, for Step 7**

`$W` is this plan's git-ignored workspace, `.superpowers/sdd/2026-10-14-ui-refresh-3a2-root-height/`.

```bash
mkdir -p "$W/before/docs/design" "$W/before/frontend/src"
cp docs/design/room.html "$W/before/docs/design/"
cp frontend/src/colours.css frontend/src/tokens.css "$W/before/frontend/src/"
```

The copy keeps `room.html`'s relative links to `../../frontend/src/`.

- [ ] **Step 2: Write `colours.css`**

Replace the file with the following. The order and comments of the existing tokens stay, but an overridden token takes the block's comment; the new tokens follow in the block's order, the decorative set last.

```css
/* The colour tokens; the contrast gate (design/tokens.gate.test.ts) checks every pair. */
:root {
  --paper: #FCFAF6; /* the page */
  --paper-warm: #FFFFFF; /* panels and cards; figures and labels on a fill */
  --paper-pale: #F7F5F2; /* the room page, the own row, the waiting pill: the darkest ground that keeps grey at 7:1 */
  --pale: #E7E2DC; /* hairlines, decorative */
  --mute-soft: #8A8480; /* the dashed outline, card and button edges, hairlines under prefers-contrast: more; 3:1 */
  --ink: #1C1917; /* text, controls, the focus ring */
  --grey: #58524F; /* supporting text; the frozen deck */
  --burgundy: #9B1A24; /* the primary button and the chosen card */
  --burgundy-deep: #931822; /* a problem's text and bar */
  --burgundy-tint: #FEF3F3; /* a problem's ground */
  --hairline-colour: var(--pale); /* dividers and surface edges */
  --card-back: #DC2F3C; /* shapes without text: the voted mark, the kept frame, the top bar, the header mark */
  --bar-other: #DE656D; /* the chart's other bars */
  --notice-ground: #EEF4FF; /* a notice's ground */
  --notice-ink: #1E3A8A; /* a notice's text */
  --notice-bar: #1D4ED8; /* a notice's icon and bar */
  --ok: #0F5D2C; /* the Voted pill's text */
  --ok-tint: #F1F9F2; /* the Voted pill's ground */
  --kept: #7F3A07; /* a kept vote's words: the tag, the pill, the roster's note */
  --kept-tint: #FAF6EC; /* the kept pill's ground */
  --track: #EFEBE7; /* the small progress bar's track */
  --pip: rgba(255, 255, 255, 0.85); /* the diamond on a voted mark and on the plain header mark */
  --mark-offset: #F9C3C6; /* the header mark's pale offset card, decorative */
  --shadow-colour: rgba(28, 25, 23, 0.05); /* a panel's soft shadow, decorative */
  --lift-colour: rgba(220, 47, 60, 0.25); /* the chosen card's glow, decorative */
}

@media (prefers-contrast: more) {
  :root {
    --hairline-colour: var(--mute-soft); /* hairlines become an indicator at 3:1 */
  }
}
```

The 3b1 decision 16 items a diff of the block does not show: `--paper-pale`'s comment names the room page's grounds, a notice's ground being `--notice-ground` now; `--card-back`'s comment drops "until 3b's choice".

Run: `npx vitest run --root frontend src/design/tokens.gate.test.ts`
Expected: 2 failed | 293 passed (295): every pair passes under every vision, and `unreached` is empty; only `'keeps colours and stray units out of tokens.css'` and `"keeps the root within J2's rules"` fail, on today's `vmin` root.

- [ ] **Step 3: Write `tokens.css`**

Replace the file with the following. The weights are named by weight, not by font, and `--font-mono`'s comment drops the figures (3b1 decision 16). The shadows' lengths follow the lines (decision 2), and the room page's layout sizes form a group before the duration.

```css
/* Every token but the colours (colours.css); the gate checks its units and J2's root. */
:root {
  --root-size: clamp(1rem, min(1.05vh, 0.82vw) + 0.5rem, 1.75rem); /* J2's root, the one fluid value, following the height */
  --shell-height: 100dvh; /* the app shell's height (J2) */

  --font-sans: 'Inter', system-ui, sans-serif; /* all text but the room id (J7) */
  --font-mono: 'JetBrains Mono', ui-monospace, monospace; /* the room id (J7) */
  --font-serif: 'Instrument Serif', ui-serif, serif; /* at most the app's name in the lobby (J7) */
  --text-tag: 0.6875rem; /* the kept tag, a note beside a value, an avatar's initials */
  --text-xs: 0.75rem; /* labels, pills and small notes */
  --text-sm: 0.875rem; /* labels */
  --text-md: 1rem; /* body */
  --text-lg: 1.25rem; /* headings and deck figures */
  --text-xl: 1.625rem; /* own-page emphasis */
  --text-2xl: 2.125rem; /* the 3 m step */
  --text-3xl: 2.75rem; /* the 4 m step, shared-screen text (J7) */
  --text-4xl: 3.5rem; /* result figures */
  --weight-regular: 400; /* body text */
  --weight-medium: 500; /* names, messages and quiet controls */
  --weight-strong: 600; /* the lead, headings, labels and buttons */
  --weight-bold: 700; /* figures and the app's name */
  --leading-body: 1.5; /* body text (WCAG 1.4.8) */
  --leading-tight: 1.15; /* the large steps */
  --leading-figure: 1; /* one line of figures or labels */
  --tracking-label: 0.06em; /* uppercase labels */
  --tight-point: -0.08em; /* the point in "0.5", following its figure (J2's em); Inter's point vanishes past it */

  --space-1: 0.25rem; /* gaps and padding, smallest */
  --space-2: 0.5rem; /* gaps and padding */
  --space-3: 0.75rem; /* gaps and padding */
  --space-4: 1rem; /* gaps and padding */
  --space-5: 1.5rem; /* gaps and padding */
  --space-6: 2rem; /* gaps and padding */
  --space-7: 3rem; /* gaps and padding */
  --space-8: 4rem; /* gaps and padding, largest */

  --radius: 0.875rem; /* panels and messages (J9) */
  --radius-card: 0.5rem; /* cards, rows, the copy button, inputs (J9) */
  --radius-control: 0.625rem; /* buttons and the room chip (J9) */
  --radius-mark: 0.375rem; /* small cards: the header mark and the table's marks */
  --radius-small: 0.25rem; /* a bar's top corners and the progress track */
  --radius-pill: 100rem; /* fully rounded ends */
  --target-min: max(44px, 2.75rem); /* a control's least width and height (WCAG 2.5.5) */

  --line-hairline: 1px; /* the hairline's width, the one px value (J2) */
  --line-control: max(1px, 0.0625rem); /* buttons, inputs, unchosen card edges */
  --line-mark: max(2px, 0.125rem); /* J3's outline mark */
  --frame-band: max(2px, 0.375rem); /* a card's kept frame (J3) */
  --line-bar: max(3px, 0.1875rem); /* a message's bar */
  --focus-width: max(2px, 0.125rem); /* the focus ring's thickness (J8) */
  --focus-gap: max(2px, 0.125rem); /* the focus ring's offset (J8) */

  --shadow: 0 max(1px, 0.0625rem) max(2px, 0.125rem); /* a panel's soft shadow, drawn in --shadow-colour (J9) */
  --lift-shadow: 0 0.4rem 0.9rem; /* the chosen card's glow, drawn in --lift-colour */

  --panel-gap: 0.875rem; /* between panels, and a panel's block padding */
  --panel-inline: 1.125rem; /* a panel's inline padding */
  --page-edge: 1.25rem; /* the page's side margin */
  --header-height: 3.5rem; /* the header bar */
  --brand-height: 1.875rem; /* the header mark */
  --sidebar: 18.125rem; /* the participants sidebar */
  --icon: 1.125rem; /* an icon beside its words */
  --avatar: 1.375rem; /* a roster avatar */
  --row-height: 1.75rem; /* a roster or history row */
  --action-width: 8.5rem; /* a button's least width */
  --progress-width: 8rem; /* the voter's small progress bar */
  --bar-min: 0.375rem; /* the thinnest bar: the progress track, a chart bar's floor */
  --deck-card: 5.5rem; /* a deck card's greatest height, 5:7 */
  --entry-mark: 3.85rem; /* an entry's card at scale 1, 5:7 */
  --entry-width: 4.875rem; /* an entry, its name included, at scale 1 */
  --table-min: 5rem; /* the table's least height: its title and a strip of cards */
  --slot-height: 7.5rem; /* the slot: deck, progress or result */
  --chart-value: 2.25rem; /* the chart's value row */
  --value-fit: 66cqi; /* a chart value's largest size in its column: the widest, a tight "0.5" in Inter bold, is 1.46em, with a margin */
  --chart-bar: 2rem; /* the chart's tallest bar */

  --duration: 180ms; /* every transition, the site's shortest (J9) */
}

@media (prefers-contrast: more) {
  :root {
    --line-control: var(--line-mark); /* controls take the mark's weight */
  }
}
```

- [ ] **Step 4: Run the gate on the real files**

Run: `npx vitest run --root frontend src/design`
Expected: `Test Files 3 passed (3)`, `Tests 415 passed (415)`: the gate 77, the real files 295, contrast 43.

- [ ] **Step 5: Remove the block from `room.html` and join each shadow to its colour**

In `docs/design/room.html`, delete from the line

```
  /* 3a2's tokens (decision 16): the designer's values under the app's names, the height-first root, and the sizes this page adds */
```

through the `  }` that closes that `:root` rule, the line before `  * { box-sizing: border-box; }` (61 lines; the `<style>` line stays). Then make three replacements, each string occurring once:

- `border-radius: var(--radius);\n    box-shadow: var(--shadow);` (the panel) → `border-radius: var(--radius);\n    box-shadow: var(--shadow) var(--shadow-colour);`
- `border-radius: var(--radius); box-shadow: var(--shadow);` (the messages) → `border-radius: var(--radius); box-shadow: var(--shadow) var(--shadow-colour);`
- `box-shadow: var(--lift-shadow);` (the chosen card) → `box-shadow: var(--lift-shadow) var(--lift-colour);`

- [ ] **Step 6: Check every shadow use carries its colour (Review Focus 1)**

Run: `grep -n "var(--shadow)\|var(--lift-shadow)\|3a2's tokens\|^  :root" docs/design/room.html`
Expected: exactly three lines, each `var(--shadow) var(--shadow-colour)` (twice) or `var(--lift-shadow) var(--lift-colour)` (once); no `3a2's tokens` and no `:root` line.

- [ ] **Step 7: Check the mockup changed only by decision 6 and the soft shadow (Review Focus 2)**

Write `$W/stylediff.mjs`:

```js
import { chromium } from 'playwright'
// Every computed style of every element, before and after, at three sizes and three states.
const [before, after] = process.argv.slice(2)
const sizes = [[1280, 680], [1472, 1493], [3072, 1598]]
const queries = ['?phase=revote&message=lost,restarted', '?phase=revealed-revote&role=facilitator', '?later=1']
const browser = await chromium.launch()
const grab = async (file, w, h, q) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  await page.goto(`file://${file}${q}`)
  await page.locator('[data-vote]').first().click({ timeout: 1000 }).catch(() => {})
  await page.waitForTimeout(300)
  const styles = await page.evaluate(() => [...document.querySelectorAll('*')].map(el => {
    const cs = getComputedStyle(el), o = {}
    for (const p of cs) o[p] = cs.getPropertyValue(p)
    return o
  }))
  await page.close()
  return styles
}
const tally = {}
for (const [w, h] of sizes) for (const q of queries) {
  const [a, b] = [await grab(before, w, h, q), await grab(after, w, h, q)]
  if (a.length !== b.length) console.log('element count differs', w, h, q)
  a.forEach((s, i) => { for (const p in s) if (!p.startsWith('--') && s[p] !== b[i]?.[p]) {
    const key = `${p}: ${s[p]}  →  ${b[i]?.[p]}`; tally[key] = (tally[key] ?? 0) + 1 } })
}
for (const [k, n] of Object.entries(tally).sort()) console.log(n, k)
await browser.close()
```

Run: `node "$W/stylediff.mjs" "$W/before/docs/design/room.html" "$PWD/docs/design/room.html" | grep -v "webkit\|border-block\|border-inline\|caret\|column-rule\|row-rule\|text-decoration\|text-emphasis\|outline-color"`
Expected (counts aside), only these colour pairs and the two shadow lines:
- `rgb(163, 27, 38)  →  rgb(155, 26, 36)` (`--burgundy`) and `rgb(163, 27, 38)  →  rgb(147, 24, 34)` (`--burgundy-deep`);
- `rgb(16, 97, 46)  →  rgb(15, 93, 44)` (`--ok`);
- `rgb(135, 62, 7)  →  rgb(127, 58, 7)` (`--kept`);
- `rgb(224, 108, 116)  →  rgb(222, 101, 109)` (`--bar-other`);
- `box-shadow: rgba(28, 25, 23, 0.05) 0px 1px 2px 0px  →  rgba(28, 25, 23, 0.05) 0px 1.2544px 2.5088px 0px` and `… 0px 1.54869px 3.09737px 0px`, the soft shadow growing with the root at the two larger sizes;
- no `element count differs` line, and nothing else.

- [ ] **Step 8: Run every check**

Run: `npm run test:unit && npm run typecheck && npm run lint`
Expected: `Tests 529 passed (529)` (422 before, plus 11 gate and 96 real-file cases), then no typecheck or lint output.

- [ ] **Step 9: Commit 2**

```bash
git add frontend/src/design/gate.ts frontend/src/design/gate.test.ts frontend/src/design/tokens.gate.test.ts \
  frontend/src/colours.css frontend/src/tokens.css docs/design/room.html
git commit -m "feat: move the room page's tokens into the value source (ui refresh step 3a2)"
```

---

### Task 3: The docs

**Files:**
- Modify: `docs/design/ui-reference.md`, `docs/superpowers/specs/2026-10-09-ui-refresh-3b1-wide-room-page-design.md`
- Test: `frontend/src/design/contrast.test.ts`

**Interfaces:**
- Consumes: decision 6's values, as Task 2 wrote them.
- Produces: nothing code reads.

The parent spec's pointer is already in commit 1. Each edit below names its old text, which occurs once, and its new text; rewrap nothing else.

- [ ] **Step 1: Add the Brand source's new figures to `contrast.test.ts` (Review Focus 5)**

In the `figures` array, after `["white on the app's burgundy", 'deuteranopia', white, '#8E292E', '7.43'],`, add:

```ts
  ['white on the primary button', 'deuteranopia', white, '#9B1A24', '7.05'],
  ["a problem's text on its tint", 'deuteranopia', '#931822', '#FEF3F3', '7.05'],
```

Run: `npx vitest run --root frontend src/design/contrast.test.ts`
Expected: 45 passed (45). These rows pin the reference's figures to `contrast.ts`, so they pass on first run; a mistyped figure, such as `'7.06'`, fails.

- [ ] **Step 2: The Brand source's red line**

Old:
```
  saturated. His bright red, `--card-back` #DC2F3C, marks shapes without
  text; darkened to #A31B26 it carries text and the primary button at 7:1.
```
New:
```
  saturated. His bright red, `--card-back` #DC2F3C, marks shapes without
  text. Darkened to #9B1A24, it carries the primary button's white at 7.05
  under deuteranopia, its worst vision, and a problem's text takes #931822,
  7.05 on its tint under deuteranopia (3a2 decision 6).
```

- [ ] **Step 3: J2**

Old:
```
- The root font size is the only fluid value:
  `clamp(<min>rem, <a>vmin + <b>rem, <max>rem)`, the `--root-size` token,
  which the contrast gate (J8) checks against the three rules below. Step 3a2
  makes it follow the height, `clamp(1rem, min(1.05vh, 0.82vw) + 0.5rem,
  1.75rem)`, and rewrites the gate's check to match; until then the mockups
  set it over the value source. Its limits
  are in `rem`, so the reader's default font size counts.
```
New:
```
- The root font size is the only fluid value, the `--root-size` token,
  `clamp(1rem, min(1.05vh, 0.82vw) + 0.5rem, 1.75rem)`: it follows the
  height, and the width instead on windows less than 1.28 times as wide as
  tall. The contrast gate (J8) passes only the shape `clamp(<min>rem,
  min(<a>vh, <c>vw) + <b>rem, <max>rem)` and checks it against the three
  rules below; the `vw` term can only lower the root, so no rule bounds `c`
  before 3b2. Its limits are in `rem`, so the reader's default font size
  counts.
```

Old:
```
  fit, in `cqi` so that it follows its column; 3a2 settles the gate's units
  (3b1 decision 16). No viewport unit appears outside the root but the app
```
New:
```
  fit, in `cqi` so that it follows its column; the gate allows each unit on
  its tokens only. No viewport unit appears outside the root but the app
```

Old:
```
  nothing; the shadows' `px` (J9) wait on 3a2 (3b1 decision 16). The gate
  checks the units in `tokens.css`.
```
New:
```
  nothing, the soft shadow's lengths included (J9). The gate checks the units
  in `tokens.css`.
```

- [ ] **Step 4: J8**

Old:
```
  control included. Hairlines are decorative and exempt, and so are the
  roster's avatars, initials on a pale ground in a hue hashed from the name,
  `aria-hidden` and incidental: the name beside them carries the information.
- 3b1's new pairs, text and shapes, are listed in its spec's Measured.
```
New:
```
  control included. The decorative colours are exempt, the gate's decorative
  set: the hairline's pale, and the colours drawn only in a shadow, the soft
  shadow's, the chosen card's glow and the header mark's offset card, since
  forced colours drop shadows and the hairline alone tells surfaces apart
  (J9). So are the roster's avatars, initials on a pale ground in a hue hashed
  from the name, `aria-hidden` and incidental: the name beside them carries
  the information.
```

- [ ] **Step 5: J9**

Old:
```
  surfaces on white panels with rounded corners, a hairline and a soft shadow
  (3b1's second look); the hairline alone tells them apart where a shadow is
  lost.
```
New:
```
  surfaces on white panels with rounded corners, a hairline and a soft shadow
  (3b1's second look); the hairline alone tells them apart where a shadow is
  lost. A shadow is two tokens, its lengths in `tokens.css` and its colour in
  `colours.css`, joined where it is used: `var(--shadow) var(--shadow-colour)`.
```

- [ ] **Step 6: The Tokens section**

In the table, replace the Colour, Type and Shape rows, and add a Layout row after the Lines row:

```
| Colour | the papers, pale and ink (Brand source), the supporting grey (J8), the app's burgundy and its tint, burgundy-deep, the hairline colour and its `more` value (J8), the card back (J4); from 3b1, the chart's other bars, the notice's three, the voted and kept pills, the progress track, the pip, the header mark's offset and the shadows' colours |
| Type | the families (J7); the scale's steps, the weights, the leadings, the label tracking and the tight point |
| Shape | the radii (J9); the least target size; the shadows' lengths (J9) |
| Layout | the room page's sizes, such as the sidebar, the header, the panels' gaps and the deck card (J10) |
```

Old:
```
- 3b may add a token a layout needs: it adds it to the value source, and its
  reason to the log. 3b1's are declared in `room.html`'s "3a2's tokens"
  block, which step 3a2 moves to the value source as it stands (3b1 decision
  16); the weights are then named by weight, not by font.
```
New:
```
- 3b may add a token a layout needs: it adds it to the value source, and its
  reason to the log. 3b1's moved there from `room.html` in step 3a2 (3b1
  decision 16); the weights are named by weight, not by font.
```

- [ ] **Step 7: The log**

Old:
```
  - **L. #A31B26 stays** for the button and the chosen card; the bright
    variants broke B or convinced nobody.
```
New:
```
  - **L. #A31B26 stays** for the button and the chosen card; the bright
    variants broke B or convinced nobody. Reopened by 3a2 (decision 6): its
    figures were measured under normal vision only, and the gate's
    simulations darken it to #9B1A24, and a problem's text to #931822.
```

After the entry that begins `- **3a.** The token values, the gate and the kept frame`, add:

```
- **3a2.** The room page's tokens moved to the value source, checked by the
  gate, with their own spec,
  `docs/superpowers/specs/2026-10-14-ui-refresh-3a2-root-height-design.md`.
  A shadow is two tokens so that each file keeps one kind; a unit maps to the
  tokens that may use it; the root's `vw` term only lowers it; only colours a
  reader never needs skip a pair. Five values darkened to pass every vision,
  each by the least the gate allows. Set aside: a shadow kind in the gate,
  which adds a parser; shadows as literals, outside the value source; a
  viewport grid for the root, which turns the rules into samples; exempting
  the pip and the track; checking the simulations on shapes only, or
  exempting the button's white, either of which keeps #A31B26 by weakening
  the gate.
```

- [ ] **Step 8: 3b1's figures**

In `docs/superpowers/specs/2026-10-09-ui-refresh-3b1-wide-room-page-design.md`, decision 14:

Old:
```
    one red fill with text, its figure in white, so it takes the toggle's
    `--burgundy` (7.66), not `--card-back` (4.65).
```
New:
```
    one red fill with text, its figure in white, so it takes the toggle's
    `--burgundy` (7.66 under normal vision, darkened by 3a2's decision 6),
    not `--card-back` (4.65).
```

Measured:

Old:
```
- Contrast, the gate's new pairs: text at 7:1, grey on paper-pale 7.06 and on
  paper-warm 7.68, burgundy on paper-warm 7.66 both ways, burgundy-deep on
  burgundy-tint 7.05, notice-ink on notice-ground 9.38, ok on ok-tint 7.06,
  kept on kept-tint 7.15, on paper-warm 7.71 and on paper-pale 7.09, the own
  row's note; shapes at 3:1, card-back 4.65, mute-soft 3.69 and bar-other 3.20
  on paper-warm, paper-warm on card-back 4.65, notice-bar on notice-ground
  6.07.
```
New:
```
- Contrast under normal vision, the gate's new pairs: text at 7:1, grey on
  paper-pale 7.06 and on paper-warm 7.68, burgundy on paper-warm 7.66 both
  ways, burgundy-deep on burgundy-tint 7.05, notice-ink on notice-ground 9.38,
  ok on ok-tint 7.06, kept on kept-tint 7.15, on paper-warm 7.71 and on
  paper-pale 7.09, the own row's note; shapes at 3:1, card-back 4.65,
  mute-soft 3.69 and bar-other 3.20 on paper-warm, paper-warm on card-back
  4.65, notice-bar on notice-ground 6.07. 3a2's decision 6 darkens five of
  these values to pass under every vision.
```

- [ ] **Step 9: Check nothing still waits on 3a2**

Run: `grep -n "3a2 settles\|wait on 3a2\|<a>vmin\|but --pale\|spec's Measured\|darkened to #A31B26" docs/design/ui-reference.md`
Expected: no output. (The J2 log's `vmin` history stays: it records what 3b1 found.)

Run: `npm run test:unit`
Expected: `Tests 531 passed (531)`.

- [ ] **Step 10: Commit 3**

```bash
git add docs/design/ui-reference.md docs/superpowers/specs/2026-10-09-ui-refresh-3b1-wide-room-page-design.md \
  frontend/src/design/contrast.test.ts
git commit -m "docs: give the design reference the room page's tokens (ui refresh step 3a2)"
```
