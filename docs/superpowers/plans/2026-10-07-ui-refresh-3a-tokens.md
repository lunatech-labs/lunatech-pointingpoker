# UI Refresh Step 3a: Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the design reference its token values: the colour and other tokens in two CSS files, a contrast gate in `test:unit` that checks them under colour-blind simulation, and the reference rewritten to point to them.

**Architecture:** A pure contrast method (`frontend/src/design/contrast.ts`) reproduces the reference's published figures. A gate module (`frontend/src/design/gate.ts`) parses `frontend/src/colours.css` and `frontend/src/tokens.css`, holds the spec's table of pairs, and reports what the files may not hold. A Vitest file reads the real files and checks every pair under every vision. Nothing imports the CSS files before step 4. The reference is edited directly and reviewed as its diff.

**Tech Stack:** TypeScript ~5.9 (strict), Vitest 5, Node 24, plain CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-10-07-ui-refresh-3a-tokens-design.md` (commit 1). Read it beside this plan; `docs/design/ui-reference.md` is the document Task 3 edits.

## Global Constraints

- Branch `20260930.ui_refresh_3a_tokens`, stacked on `20260930.ui_refresh_3_design_direction` (#436). Commit 1 (the spec) is already there; this plan adds commits 2, 3 and 4, one per task. Do not push or open a PR unless the user asks.
- Commit subjects, verbatim: `test: compute contrast under colour-blind simulation (ui refresh step 3a)`, `feat: add the design tokens behind a contrast gate (ui refresh step 3a)`, `docs: give the design reference its token values (ui refresh step 3a)`.
- No "Generated with Claude Code" or co-author line in any commit.
- Code comments are one or two lines, never a block. Every token in the CSS files has a one-line purpose comment.
- Imports are extension-less (`./contrast`), as in the rest of `frontend/src`.
- Floors: 7:1 for text, 3:1 for an indicator, compared on the unrounded ratio. Only the method tests round, to two decimals.
- Visions: normal, and Machado 2009 protanopia, deuteranopia and tritanopia at severity 1.
- Nothing imports `colours.css` or `tokens.css` (spec decision 1); do not add them to `main.tsx`.
- Run every command from the repository root: `npm run test:unit`, `npm run typecheck`, `npm run lint`. CI runs all three on every pull request.

## Review Focus

Inputs the spec implies that a person editing the tokens in 3b or step 4 will meet, most likely first. Task 2 pins each with a test.

1. A formatter's spelling: upper-case `VAR(`, `RGBA(`, `@MEDIA`, `:ROOT`, extra spaces, a short or lower-case hex, a last declaration without its `;`. Expected: read exactly as the canonical form. Tests: "ignores comments, case and spacing a formatter may change", "reads a short hex as its long form", the `RGBA( 142 ,41, 46 , .08 )` case, "reads a last declaration with no semicolon". A typo instead, a `;` missing between two declarations or `1..75rem` in the root, fails: "fails on a missing semicolon between two declarations", "fails on a malformed number".
2. 3b adds a colour token and no pair. Expected: the gate fails and names the token, rather than passing it unchecked. Test: "include a token added without a pair".
3. 3b gives the card back, or any ground, a translucent value. Expected: a loud failure naming the token, not a ratio against nothing. Test: "fails on a ground with alpha and no surface under it".
4. Two colour tokens that point to each other through `var()`. Expected: a failure with a message, not a hang. Test: "fails on a var() cycle rather than looping".
5. A `px` that slips into `tokens.css` outside a floor: inside `min()` or `calc()`, or written `PX`. Expected: reported. Tests: the `calc(2px + 1rem)` and `min(2PX, 1rem)` cases.

## Files

| File | Task | Responsibility |
| --- | --- | --- |
| `frontend/src/design/contrast.ts` | 1 | Parse a colour, composite in sRGB, simulate a vision, WCAG ratio |
| `frontend/src/design/contrast.test.ts` | 1 | The reference's figures as fixtures |
| `frontend/src/design/gate.ts` | 2 | Parse the value source, the pairs, what each file may hold, J2's root |
| `frontend/src/design/gate.test.ts` | 2 | The gate's mechanics on small inputs, each failure shown |
| `frontend/src/colours.css` | 2 | Every colour token |
| `frontend/src/tokens.css` | 2 | Every other token |
| `frontend/src/design/tokens.gate.test.ts` | 2 | The gate on the real files |
| `docs/design/ui-reference.md` | 3 | The reference, pointed at the value source |

---

### Task 1: The contrast method (commit 2)

**Files:**
- Create: `frontend/src/design/contrast.ts`
- Test: `frontend/src/design/contrast.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Rgba = { r: number; g: number; b: number; a: number }` (channels 0–255, alpha 0–1); `type Vision = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia'`; `parseColour(text: string): Rgba`, which reads `#rgb`, `#rrggbb` and `rgba(r, g, b, a)` in any case and throws `not a hex or an rgba() colour: <text>` otherwise; `composite(top: Rgba, under: Rgba): Rgba`, opaque and rounded to 8 bits; `contrast(foreground: Rgba, ground: Rgba, vision?: Vision): number`, unrounded, for opaque colours.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/design/contrast.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { composite, contrast, parseColour, type Vision } from './contrast'

const paper = '#FCFAF6'
const paperPale = '#F0EBE2'
const ink = '#1E1815'
const white = '#FFFFFF'
const siteBurgundy = '#952B30'
const siteTint = 'rgba(149, 43, 48, 0.08)'

const ratio = (foreground: string, ground: string, vision: Vision) =>
  contrast(parseColour(foreground), parseColour(ground), vision).toFixed(2)

// Every figure in ui-reference.md's "Brand source" and J6 log, from the colours it names.
const figures: [string, Vision, string, string, string][] = [
  ['burgundy on paper', 'normal', siteBurgundy, paper, '7.56'],
  ['burgundy-deep on paper', 'normal', '#5C1C20', paper, '12.27'],
  ['ink on paper', 'normal', ink, paper, '16.83'],
  ['ink-soft on paper', 'normal', '#3B312C', paper, '12.12'],
  ['mute on paper', 'normal', '#6B5E54', paper, '6.01'],
  ['mute-soft on paper', 'normal', '#8A7A70', paper, '3.95'],
  ['white on burgundy', 'normal', white, siteBurgundy, '7.88'],
  ['burgundy against ink', 'normal', siteBurgundy, ink, '2.23'],
  ['burgundy against ink', 'protanopia', siteBurgundy, ink, '1.79'],
  ['burgundy on paper', 'deuteranopia', siteBurgundy, paper, '6.67'],
  ['white on burgundy', 'deuteranopia', white, siteBurgundy, '6.95'],
  ["the app's burgundy on paper", 'deuteranopia', '#8E292E', paper, '7.14'],
  ["white on the app's burgundy", 'deuteranopia', white, '#8E292E', '7.43'],
  ['ink on paper-pale', 'normal', ink, paperPale, '14.78'],
  ['ink on paper-pale', 'protanopia', ink, paperPale, '14.78'],
  ['ink on paper-pale', 'deuteranopia', ink, paperPale, '14.77'],
  ['ink on paper-pale', 'tritanopia', ink, paperPale, '14.77']
]

// J6's burgundy-deep on the site's tint over paper.
const tintFigures: [Vision, string][] = [
  ['normal', '10.75'],
  ['protanopia', '11.99'],
  ['deuteranopia', '10.07'],
  ['tritanopia', '10.75']
]

describe('the contrast method', () => {
  it.each(['normal', 'protanopia', 'deuteranopia', 'tritanopia'] as const)(
    'rates black on white 21 under %s', vision => {
      expect(ratio('#000000', white, vision)).toBe('21.00')
    })

  it.each(figures)('rates %s under %s as the reference states', (_, vision, foreground, ground, figure) => {
    expect(ratio(foreground, ground, vision)).toBe(figure)
  })

  it("composites the site's tint over paper in sRGB, rounded to 8 bits", () => {
    expect(composite(parseColour(siteTint), parseColour(paper))).toEqual({ r: 244, g: 233, b: 230, a: 1 })
  })

  it.each(tintFigures)("rates burgundy-deep on the site's tint over paper under %s at %s", (vision, figure) => {
    const tint = composite(parseColour(siteTint), parseColour(paper))
    expect(contrast(parseColour('#5C1C20'), tint, vision).toFixed(2)).toBe(figure)
  })

  it('does not depend on which colour is the foreground', () => {
    expect(ratio(paper, ink, 'tritanopia')).toBe(ratio(ink, paper, 'tritanopia'))
  })
})

describe('reading a colour', () => {
  it.each(['#8e292e', '#8E292E', ' #8E292E '])('reads the hex %j', text => {
    expect(parseColour(text)).toEqual({ r: 142, g: 41, b: 46, a: 1 })
  })

  it('reads a short hex as its long form', () => {
    expect(parseColour('#fA0')).toEqual(parseColour('#FFAA00'))
  })

  it.each(['rgba(142, 41, 46, 0.08)', 'RGBA( 142 ,41, 46 , .08 )'])('reads the rgba() %j', text => {
    expect(parseColour(text)).toEqual({ r: 142, g: 41, b: 46, a: 0.08 })
  })

  it.each(['red', 'Canvas', 'rgb(1, 2, 3)', '#12345', '#11223344', 'var(--ink)', ''])(
    'rejects %j', text => {
      expect(() => parseColour(text)).toThrow('not a hex or an rgba() colour')
    })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm run test:unit -- src/design/contrast.test.ts`
Expected: FAIL, `Failed to resolve import "./contrast"` (or "Cannot find module").

- [ ] **Step 3: Write the method**

Create `frontend/src/design/contrast.ts`:

```ts
export type Rgba = { r: number; g: number; b: number; a: number }
export type Vision = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia'

type Matrix = readonly (readonly [number, number, number])[]

// Machado, Oliveira and Fernandes 2009, severity 1, applied to linear RGB.
const machado: Record<Exclude<Vision, 'normal'>, Matrix> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998]
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881]
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039]
  ]
}

export const parseColour = (text: string): Rgba => {
  const value = text.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value)?.[1]
  if (hex) {
    const full = hex.length === 3 ? [...hex].map(digit => digit + digit).join('') : hex
    const channel = (at: number) => parseInt(full.slice(at, at + 2), 16)
    return { r: channel(0), g: channel(2), b: channel(4), a: 1 }
  }
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i.exec(value)
  if (rgba) return { r: +rgba[1], g: +rgba[2], b: +rgba[3], a: +rgba[4] }
  throw new Error(`not a hex or an rgba() colour: ${text}`)
}

// In sRGB, rounded to 8 bits, as the browser paints it.
export const composite = (top: Rgba, under: Rgba): Rgba => {
  const mix = (over: number, below: number) => Math.round(over * top.a + below * (1 - top.a))
  return { r: mix(top.r, under.r), g: mix(top.g, under.g), b: mix(top.b, under.b), a: 1 }
}

const linear = (channel: number) => {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const luminance = (colour: Rgba, vision: Vision) => {
  const rgb = [linear(colour.r), linear(colour.g), linear(colour.b)]
  const seen = vision === 'normal' ? rgb : machado[vision].map(row =>
    Math.min(1, Math.max(0, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2])))
  return 0.2126 * seen[0] + 0.7152 * seen[1] + 0.0722 * seen[2]
}

// WCAG's ratio, unrounded, of two opaque colours as the given vision sees them.
export const contrast = (foreground: Rgba, ground: Rgba, vision: Vision = 'normal') => {
  const [lighter, darker] = [luminance(foreground, vision), luminance(ground, vision)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npm run test:unit -- src/design/contrast.test.ts`
Expected: PASS, 40 tests.

- [ ] **Step 5: Prove the fixtures can fail**

In `composite`, replace `Math.round(over * top.a + below * (1 - top.a))` with `over * top.a + below * (1 - top.a)`, and run the same command.
Expected: FAIL, 5 tests: the 8-bit composite and the four tint figures. Restore the line and run again: PASS, 40 tests.

- [ ] **Step 6: Check types and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/design/contrast.ts frontend/src/design/contrast.test.ts
git commit -m "test: compute contrast under colour-blind simulation (ui refresh step 3a)" -m "The method the 3a contrast gate uses: a ground with alpha composited in sRGB and rounded to 8 bits, Machado 2009's matrices at severity 1 in linear RGB, then WCAG's ratio. Every figure in the reference's Brand source and J6 log is a fixture; the four ink on paper-pale figures are 14.78, 14.78, 14.77 and 14.77, which the reference rounds to one."
```

---

### Task 2: The value source and the gate (commit 3)

**Files:**
- Create: `frontend/src/design/gate.ts`
- Test: `frontend/src/design/gate.test.ts`
- Create: `frontend/src/colours.css`
- Create: `frontend/src/tokens.css`
- Test: `frontend/src/design/tokens.gate.test.ts`

**Interfaces:**
- Consumes from Task 1: `parseColour`, `composite`, `contrast`, `type Rgba`, `type Vision`.
- Produces: `TEXT = 7`, `INDICATOR = 3`; `type Run = 'base' | 'more'`; `type Tokens = ReadonlyMap<string, string>`; `type Ground = { token: string; over?: string }`; `type Pair = { foreground: string; ground: Ground; floor: number }`; `parseColours(css: string): Record<Run, Tokens>` (throws on a bad shape, a duplicate, a bad value or a `var()` to a token its run does not declare); `parseTokens(css: string): Record<Run, Tokens>`, the same reading of `tokens.css` without the colour check; `paint(tokens: Tokens, pair: Pair): [Rgba, Rgba]`, the opaque foreground and ground; `pairs(run: Run): Pair[]`; `unreached(runs: Record<Run, Tokens>): string[]`; `tokenProblems(runs: Record<Run, Tokens>, colourNames: ReadonlySet<string>): string[]`; `rootProblems(runs: Record<Run, Tokens>): string[]`, both checking each run. 3b and step 4 add a pair by editing `pairs`.

- [ ] **Step 1: Write the gate's mechanics tests**

Create `frontend/src/design/gate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  INDICATOR,
  TEXT,
  paint,
  pairs,
  parseColours,
  parseTokens,
  rootProblems,
  tokenProblems,
  unreached
} from './gate'

const file = (base: string, more = '') =>
  `:root { ${base} }\n@media (prefers-contrast: more) { :root { ${more} } }`
const shapeError = 'one :root block, then one @media (prefers-contrast: more) block'

describe('reading colours.css', () => {
  it('lays the more block over the :root values', () => {
    const runs = parseColours(file('--a: #000000; --b: var(--a);', '--b: #FFFFFF;'))
    expect(Object.fromEntries(runs.base)).toEqual({ '--a': '#000000', '--b': 'var(--a)' })
    expect(Object.fromEntries(runs.more)).toEqual({ '--a': '#000000', '--b': '#FFFFFF' })
  })

  it('ignores comments, case and spacing a formatter may change', () => {
    const css = '/* the colours */\n:ROOT{--a:#000;/* one */--b:VAR( --a );}\n@MEDIA (PREFERS-CONTRAST:MORE){:root{}}'
    expect(Object.fromEntries(parseColours(css).base)).toEqual({ '--a': '#000', '--b': 'VAR( --a )' })
  })

  it.each([
    ['another rule', `${file('--a: #000000;')}\n.card { color: red; }`],
    ['a second :root block', `:root { --a: #000000; }\n${file('--b: #000000;')}`],
    ['the more block first', '@media (prefers-contrast: more) { :root { } }\n:root { --a: #000000; }'],
    ['another media query', ':root { --a: #000000; }\n@media (prefers-color-scheme: dark) { :root { } }']
  ])('fails on %s', (_, css) => {
    expect(() => parseColours(css)).toThrow(shapeError)
  })

  it('fails on a token declared twice in one block', () => {
    expect(() => parseColours(file('--a: #000000; --a: #111111;'))).toThrow('--a is declared twice in :root')
  })

  it.each(['red', 'Canvas', 'rgb(0, 0, 0)', 'transparent', 'currentColor'])('fails on the value %j', value => {
    expect(() => parseColours(file(`--a: ${value};`))).toThrow('not a hex or an rgba() colour')
  })

  it('fails on a var() to a token colours.css does not declare', () => {
    expect(() => parseColours(file('--a: var(--b);'))).toThrow('--a refers to --b, which is not a colour token')
  })

  it('checks a :root value the more block overrides', () => {
    expect(() => parseColours(file('--a: rgb(0 0 0);', '--a: #000000;')))
      .toThrow('not a hex or an rgba() colour')
  })

  it('fails on a :root var() to a token only the more block declares', () => {
    expect(() => parseColours(file('--a: var(--b);', '--b: #000000;')))
      .toThrow('--a refers to --b, which is not a colour token')
  })
})

describe('painting a pair', () => {
  const pair = (foreground: string, token: string, over?: string) =>
    ({ foreground, ground: { token, over }, floor: TEXT })
  const grey = (level: number) => ({ r: level, g: level, b: level, a: 1 })

  it('composites a ground with alpha over its surface, then the foreground over the ground', () => {
    const tokens = parseColours(file('--fg: rgba(0, 0, 0, 0.5); --tint: rgba(0, 0, 0, 0.5); --paper: #FFFFFF;'))
    expect(paint(tokens.base, pair('--fg', '--tint', '--paper'))).toEqual([grey(64), grey(128)])
  })

  it('fails on a ground with alpha and no surface under it', () => {
    const tokens = parseColours(file('--fg: #000000; --back: rgba(0, 0, 0, 0.5);'))
    expect(() => paint(tokens.base, pair('--fg', '--back'))).toThrow('--back has alpha but no surface')
  })

  it('fails on a var() cycle rather than looping', () => {
    const tokens = parseColours(file('--a: var(--b); --b: var(--a); --c: #000000;'))
    expect(() => paint(tokens.base, pair('--c', '--a'))).toThrow('--a refers to itself')
  })
})

describe('the pairs', () => {
  it('hold text at 7:1 and indicators at 3:1', () => {
    expect(new Set(pairs('more').map(pair => pair.floor))).toEqual(new Set([TEXT, INDICATOR]))
  })

  it('check the hairline in the more run only', () => {
    const hairline = (run: 'base' | 'more') =>
      pairs(run).filter(pair => pair.foreground === '--hairline-colour').map(pair => pair.ground.token)
    expect(hairline('base')).toEqual([])
    expect(hairline('more')).toEqual(['--paper', '--paper-warm', '--paper-pale'])
  })
})

describe('the colour tokens no pair reaches', () => {
  const every = [
    '--paper: #FCFAF6; --paper-warm: #FEFDFB; --paper-pale: #F0EBE2; --ink: #1E1815; --grey: #554B43;',
    '--burgundy: #8E292E; --burgundy-deep: #5C1C20; --burgundy-tint: rgba(142, 41, 46, 0.08);',
    '--card-back: var(--ink); --mute-soft: #8A7A70; --pale: #D6CABB; --hairline-colour: var(--pale);'
  ].join(' ')
  const more = '--hairline-colour: var(--mute-soft);'

  it('are none when each token is in a pair, maybe through var() or the more run, but --pale', () => {
    expect(unreached(parseColours(file(every, more)))).toEqual([])
  })

  it('include a token added without a pair', () => {
    expect(unreached(parseColours(file(`${every} --spare: #000000;`, more)))).toEqual(['--spare'])
  })

  it('include a token that only an unchecked var() reaches', () => {
    expect(unreached(parseColours(file(every, '--hairline-colour: #8A7A70;')))).toEqual(['--mute-soft'])
  })
})

describe('what tokens.css may hold', () => {
  const problems = (base: string, more = '') =>
    tokenProblems(parseTokens(file(base, more)), new Set(['--ink']))

  it('fails on any rule but its two blocks', () => {
    expect(() => parseTokens(`${file('--a: 1rem;')}\nhtml { font-size: 12px; }`))
      .toThrow(`tokens.css must hold ${shapeError}`)
  })

  it('allows rem, a px floor inside max(), and px on the hairline alone', () => {
    const fine = '--a: 0.5rem; --b: max(2px, 0.125rem); --c: calc(var(--a) * 2); --line-hairline: 1px;'
    expect(problems(fine)).toEqual([])
  })

  it.each([
    ['--a: 2px;', '--a: a px outside max() in 2px'],
    ['--a: calc(2px + 1rem);', '--a: a px outside max() in calc(2px + 1rem)'],
    ['--a: min(2PX, 1rem);', '--a: a px outside max() in min(2PX, 1rem)'],
    ['--a: rgb(0, 0, 0);', '--a: rgb() in rgb(0, 0, 0)'],
    ['--a: #fff;', '--a: a hex colour in #fff'],
    ['--a: Transparent;', '--a: Transparent in Transparent'],
    ['--a: CURRENTCOLOR;', '--a: CURRENTCOLOR in CURRENTCOLOR'],
    ['--a: var(--ink);', '--a: a colour token, --ink in var(--ink)']
  ])('fails on %s', (declaration, problem) => {
    expect(problems(declaration)).toEqual([problem])
  })

  it('fails on a missing semicolon between two declarations', () => {
    expect(() => parseTokens(file('--a: 1px\n--b: 2rem;'))).toThrow('not a custom property in :root: --a: 1px')
  })

  it('reads a last declaration with no semicolon', () => {
    expect(problems('--a: 1rem; --b: 2px')).toEqual(['--b: a px outside max() in 2px'])
  })

  it('checks a :root value the more block overrides', () => {
    expect(problems('--a: 2px;', '--a: 1rem;')).toEqual(['--a: a px outside max() in 2px'])
  })

  it('fails on a colour token declared again', () => {
    expect(problems('--ink: 1rem;')).toEqual(['--ink is a colour token, declared in colours.css'])
  })
})

describe("J2's root", () => {
  const fine = 'clamp(1rem, 1.05vmin + 0.5rem, 1.75rem)'
  const root = (value: string, more = '') =>
    rootProblems(parseTokens(file(`--root-size: ${value};`, more)))

  it('passes the reference clamp', () => {
    expect(root(fine)).toEqual([])
  })

  it.each([
    ['no rem term', 'clamp(1rem, 2vmin + 0rem, 1.75rem)', 'the rem term must be above zero'],
    [
      'a maximum above 2.5 times the minimum',
      'clamp(1rem, 1.05vmin + 0.5rem, 2.6rem)',
      'the maximum 2.6rem is more than 2.5 times the minimum 1rem'
    ],
    [
      'a malformed number',
      'clamp(1rem, 1.05vmin + 0.5rem, 1..75rem)',
      '--root-size is not clamp(<min>rem, <a>vmin + <b>rem, <max>rem): clamp(1rem, 1.05vmin + 0.5rem, 1..75rem)'
    ],
    [
      'a root fluid at the tallest laptop',
      'clamp(1rem, 1.2vmin + 0.5rem, 1.75rem)',
      'at a vmin of 757 the root is above its minimum'
    ]
  ])('fails on %s', (_, value, problem) => {
    expect(root(value)).toEqual([problem])
  })

  it('fails on a root of another shape', () => {
    expect(root('1rem')).toEqual(['--root-size is not clamp(<min>rem, <a>vmin + <b>rem, <max>rem): 1rem'])
  })

  it('fails when the root is missing', () => {
    expect(rootProblems(parseTokens(file('--text-md: 1rem;')))).toEqual(['--root-size is missing'])
  })

  it('checks the root the more block sets', () => {
    expect(root(fine, '--root-size: 2rem;'))
      .toEqual(['--root-size is not clamp(<min>rem, <a>vmin + <b>rem, <max>rem): 2rem'])
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:unit -- src/design/gate.test.ts`
Expected: FAIL, `Failed to resolve import "./gate"`.

- [ ] **Step 3: Write the gate module**

Create `frontend/src/design/gate.ts`. The `pairs` function is the spec's "Pairs" table, row by row; keep it in that order so a reviewer can read one against the other.

```ts
import { composite, parseColour, type Rgba } from './contrast'

export const TEXT = 7
export const INDICATOR = 3

export type Run = 'base' | 'more'
export type Tokens = ReadonlyMap<string, string>
export type Ground = { token: string; over?: string }
export type Pair = { foreground: string; ground: Ground; floor: number }

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const reference = (value: string) => /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(value)?.[1]

const block = (body: string, where: string): Map<string, string> => {
  const tokens = new Map<string, string>()
  for (const part of body.split(';').map(text => text.trim()).filter(Boolean)) {
    // A value holds no colon, so a missing semicolon cannot merge two declarations.
    const declaration = /^(--[a-z0-9-]+)\s*:\s*([^:]+)$/.exec(part)
    if (!declaration) throw new Error(`not a custom property in ${where}: ${part}`)
    const [, name, value] = declaration
    if (tokens.has(name)) throw new Error(`${name} is declared twice in ${where}`)
    tokens.set(name, value.trim())
  }
  return tokens
}

const shape = new RegExp(
  String.raw`^:root\s*\{([^{}]*)\}\s*` +
  String.raw`@media\s*\(\s*prefers-contrast\s*:\s*more\s*\)\s*\{\s*:root\s*\{([^{}]*)\}\s*\}$`, 'i')

// Both token files: the base run is the :root block; the more run lays the more block over it.
const parseRuns = (css: string, file: string): Record<Run, Tokens> => {
  const blocks = shape.exec(stripComments(css).trim())
  if (!blocks) {
    throw new Error(`${file} must hold one :root block, then one @media (prefers-contrast: more) block`)
  }
  const base = block(blocks[1], ':root')
  return { base, more: new Map([...base, ...block(blocks[2], 'the more block')]) }
}

export const parseTokens = (css: string) => parseRuns(css, 'tokens.css')

// Each run's values are checked against that run, so an overridden base value is checked too.
export const parseColours = (css: string): Record<Run, Tokens> => {
  const runs = parseRuns(css, 'colours.css')
  for (const tokens of Object.values(runs)) {
    for (const [name, value] of tokens) {
      const target = reference(value)
      if (target === undefined) parseColour(value)
      else if (!tokens.has(target)) throw new Error(`${name} refers to ${target}, which is not a colour token`)
    }
  }
  return runs
}

// The tokens a name passes through, itself first, the last holding a literal colour.
const chain = (tokens: Tokens, name: string): string[] => {
  const path = [name]
  for (;;) {
    const value = tokens.get(path[path.length - 1])
    if (value === undefined) throw new Error(`${path[path.length - 1]} is not declared`)
    const target = reference(value)
    if (target === undefined) return path
    if (path.includes(target)) throw new Error(`${name} refers to itself through ${path.join(', ')}`)
    path.push(target)
  }
}

const resolve = (tokens: Tokens, name: string): Rgba => {
  const path = chain(tokens, name)
  return parseColour(tokens.get(path[path.length - 1])!)
}

// The ground over its surface, then the foreground over the ground, as the browser paints them.
export const paint = (tokens: Tokens, pair: Pair): [Rgba, Rgba] => {
  const { token, over } = pair.ground
  const top = resolve(tokens, token)
  if (top.a < 1 && over === undefined) throw new Error(`${token} has alpha but no surface`)
  const ground = over === undefined ? top : composite(top, resolve(tokens, over))
  return [composite(resolve(tokens, pair.foreground), ground), ground]
}

const surfaces: Ground[] = ['--paper', '--paper-warm', '--paper-pale'].map(token => ({ token }))
const tints: Ground[] = ['--paper', '--paper-warm'].map(over => ({ token: '--burgundy-tint', over }))
const fills: Ground[] = ['--card-back', '--grey', '--burgundy'].map(token => ({ token }))
const on = (foreground: string, grounds: Ground[], floor: number): Pair[] =>
  grounds.map(ground => ({ foreground, ground, floor }))

// The 3a spec's table of pairs; the hairline is an indicator only in the more run.
export const pairs = (run: Run): Pair[] => [
  ...['--ink', '--grey'].flatMap(text => on(text, [...surfaces, ...tints], TEXT)),
  ...on('--burgundy-deep', surfaces.slice(0, 2), INDICATOR),
  ...on('--burgundy-deep', tints, TEXT),
  ...on('--paper-warm', fills, TEXT),
  ...['--card-back', '--burgundy'].flatMap(mark => on(mark, surfaces, INDICATOR)),
  ...(run === 'more' ? on('--hairline-colour', surfaces, INDICATOR) : [])
]

// Colour tokens no pair reaches in either run, directly or through var(); --pale is decorative.
export const unreached = (runs: Record<Run, Tokens>): string[] => {
  const reached = new Set<string>()
  for (const run of ['base', 'more'] as const) {
    for (const { foreground, ground } of pairs(run)) {
      for (const name of [foreground, ground.token, ground.over]) {
        if (name !== undefined) chain(runs[run], name).forEach(token => reached.add(token))
      }
    }
  }
  return [...runs.more.keys()].filter(name => name !== '--pale' && !reached.has(name))
}

const allowedFunctions = new Set(['calc', 'min', 'max', 'clamp', 'var'])

// tokens.css holds no colour, no var() to one, and no px outside a floor but the hairline's (J2).
export const tokenProblems = (
  runs: Record<Run, Tokens>, colourNames: ReadonlySet<string>
): string[] => {
  const problems = new Set<string>()
  for (const [name, value] of [...runs.base, ...runs.more]) {
    const say = (what: string) => problems.add(`${name}: ${what} in ${value}`)
    if (colourNames.has(name)) problems.add(`${name} is a colour token, declared in colours.css`)
    for (const [, fn] of value.matchAll(/([a-z-]+)\(/gi)) {
      if (!allowedFunctions.has(fn.toLowerCase())) say(`${fn}()`)
    }
    if (/#[0-9a-f]{3,8}\b/i.test(value)) say('a hex colour')
    for (const [keyword] of value.matchAll(/\b(transparent|currentcolor)\b/gi)) say(keyword)
    for (const [, target] of value.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
      if (colourNames.has(target)) say(`a colour token, ${target}`)
    }
    const outsideFloors = value.replace(/max\([^()]*\)/gi, '')
    if (name !== '--line-hairline' && /\dpx\b/i.test(outsideFloors)) say('a px outside max()')
  }
  return [...problems]
}

const defaultRoot = 16
const tallestLaptopVmin = 7.57
const rootShape = new RegExp(
  String.raw`^clamp\(\s*(\d*\.?\d+)rem\s*,\s*(\d*\.?\d+)vmin\s*\+\s*(\d*\.?\d+)rem\s*,\s*(\d*\.?\d+)rem\s*\)$`,
  'i')

// J2's three rules on --root-size in each run, at a default font size of 16 px.
export const rootProblems = (runs: Record<Run, Tokens>): string[] => {
  const problems: string[] = []
  for (const declared of new Set([runs.base.get('--root-size'), runs.more.get('--root-size')])) {
    const terms = declared === undefined ? null : rootShape.exec(declared)
    if (!terms) {
      problems.push(declared === undefined ? '--root-size is missing'
        : `--root-size is not clamp(<min>rem, <a>vmin + <b>rem, <max>rem): ${declared}`)
      continue
    }
    const [min, a, b, max] = terms.slice(1).map(Number)
    if (!(b > 0)) problems.push('the rem term must be above zero')
    if (max > 2.5 * min) problems.push(`the maximum ${max}rem is more than 2.5 times the minimum ${min}rem`)
    if (a * tallestLaptopVmin + b * defaultRoot > min * defaultRoot) {
      problems.push('at a vmin of 757 the root is above its minimum')
    }
  }
  return problems
}
```

- [ ] **Step 4: Run the mechanics tests to see them pass**

Run: `npm run test:unit -- src/design/gate.test.ts`
Expected: PASS, 45 tests.

- [ ] **Step 5: Write the gate on the real files**

Create `frontend/src/design/tokens.gate.test.ts`. It finds the files through `import.meta.url`, as `src/protocol/snapshot.contract.test.ts` does.

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contrast, type Vision } from './contrast'
import { paint, pairs, parseColours, parseTokens, rootProblems, tokenProblems, unreached, type Pair, type Run } from './gate'

// The value source as written; the gate checks token pairs, not a rendered page.
const read = (file: string) => readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8')
const runs = parseColours(read('colours.css'))
const tokens = parseTokens(read('tokens.css'))

const visions: Vision[] = ['normal', 'protanopia', 'deuteranopia', 'tritanopia']
const groundName = ({ token, over }: Pair['ground']) => (over ? `${token} over ${over}` : token)
const cases = (['base', 'more'] as const).flatMap((run: Run) => pairs(run).flatMap(pair => visions.map(vision => ({
  name: `${run}: ${pair.foreground} on ${groundName(pair.ground)} under ${vision}`, run, pair, vision
}))))

describe('the contrast gate', () => {
  it.each(cases)('$name', ({ run, pair, vision }) => {
    expect(contrast(...paint(runs[run], pair), vision)).toBeGreaterThanOrEqual(pair.floor)
  })

  it('reaches every colour token but --pale', () => {
    expect(unreached(runs)).toEqual([])
  })

  it('keeps colours and stray px out of tokens.css', () => {
    expect(tokenProblems(tokens, new Set(runs.more.keys()))).toEqual([])
  })

  it("keeps the root within J2's rules", () => {
    expect(rootProblems(tokens)).toEqual([])
  })
})
```

- [ ] **Step 6: Run it to see it fail**

Run: `npm run test:unit -- src/design/tokens.gate.test.ts`
Expected: FAIL, `ENOENT: no such file or directory` on `colours.css`.

- [ ] **Step 7: Write the colour tokens**

Create `frontend/src/colours.css`. Values and purposes are the spec's "The tokens" table, Colour rows.

```css
/* The colour tokens; the contrast gate (design/tokens.gate.test.ts) checks every pair. */
:root {
  --paper: #FCFAF6; /* the page */
  --paper-warm: #FEFDFB; /* content surfaces; figures and labels on a fill */
  --paper-pale: #F0EBE2; /* a notice's ground */
  --pale: #D6CABB; /* hairlines, decorative */
  --mute-soft: #8A7A70; /* hairlines under prefers-contrast: more */
  --ink: #1E1815; /* text, controls, the focus ring */
  --grey: #554B43; /* supporting text; the frozen deck */
  --burgundy: #8E292E; /* the brand, the one primary per phase */
  --burgundy-deep: #5C1C20; /* a problem's text and bar */
  --burgundy-tint: rgba(142, 41, 46, 0.08); /* a problem's ground */
  --hairline-colour: var(--pale); /* dividers and surface edges */
  --card-back: var(--ink); /* J3's looks: outline, fill, kept frame; ink until 3b's choice */
}

@media (prefers-contrast: more) {
  :root {
    --hairline-colour: var(--mute-soft); /* hairlines become an indicator at 3:1 */
  }
}
```

- [ ] **Step 8: Write the other tokens**

Create `frontend/src/tokens.css`. Values are the spec's table, every row but Colour.

```css
/* Every token but the colours (colours.css); the gate checks its units and J2's root. */
:root {
  --root-size: clamp(1rem, 1.05vmin + 0.5rem, 1.75rem); /* J2's root, the one fluid value */
  --shell-height: 100dvh; /* the app shell's height (J2) */

  --font-sans: 'DM Sans', system-ui, sans-serif; /* all text but figures (J7) */
  --font-mono: 'JetBrains Mono', ui-monospace, monospace; /* figures and the room id (J7) */
  --font-serif: 'Instrument Serif', ui-serif, serif; /* at most the app's name in the lobby (J7) */
  --text-sm: 0.875rem; /* labels */
  --text-md: 1rem; /* body */
  --text-lg: 1.25rem; /* headings and deck figures */
  --text-xl: 1.625rem; /* own-page emphasis */
  --text-2xl: 2.125rem; /* the 3 m step */
  --text-3xl: 2.75rem; /* the 4 m step, shared-screen text (J7) */
  --text-4xl: 3.5rem; /* result figures */
  --weight-regular: 400; /* DM Sans and JetBrains Mono */
  --weight-medium: 500; /* JetBrains Mono only */
  --weight-strong: 600; /* DM Sans only, the lead */
  --leading-body: 1.5; /* body text (WCAG 1.4.8) */
  --leading-tight: 1.15; /* the large steps */
  --tracking-label: 0.12em; /* uppercase mono labels */

  --space-1: 0.25rem; /* gaps and padding, smallest */
  --space-2: 0.5rem; /* gaps and padding */
  --space-3: 0.75rem; /* gaps and padding */
  --space-4: 1rem; /* gaps and padding */
  --space-5: 1.5rem; /* gaps and padding */
  --space-6: 2rem; /* gaps and padding */
  --space-7: 3rem; /* gaps and padding */
  --space-8: 4rem; /* gaps and padding, largest */

  --radius: 0; /* every corner but a card's (J9) */
  --radius-card: 0.25rem; /* the deck's cards and L3's card entries (J9) */
  --target-min: max(44px, 2.75rem); /* a control's least width and height (WCAG 2.5.5) */

  --line-hairline: 1px; /* the hairline's width, the one px value (J2) */
  --line-control: max(1px, 0.0625rem); /* buttons, inputs, unchosen card edges */
  --line-mark: max(2px, 0.125rem); /* J3's outline mark */
  --frame-band: max(2px, 0.5rem); /* a card's kept frame (J3) */
  --line-bar: max(3px, 0.1875rem); /* a message's bar */
  --focus-width: max(2px, 0.125rem); /* the focus ring's thickness (J8) */
  --focus-gap: max(2px, 0.125rem); /* the focus ring's offset (J8) */

  --duration: 180ms; /* every transition, the site's shortest (J9) */
}

@media (prefers-contrast: more) {
  :root {
    --line-control: var(--line-mark); /* controls take the mark's weight */
  }
}
```

- [ ] **Step 9: Run the gate to see it pass**

Run: `npm run test:unit -- src/design/tokens.gate.test.ts`
Expected: PASS, 199 tests: 196 pair cases (26 pairs in the more run and 23 in the base run, each under 4 visions) and the three file checks. The tightest cases are `--grey` on `--burgundy-tint` over `--paper` under deuteranopia (7.07) and, in the more run, `--hairline-colour` on `--paper-pale` under deuteranopia (3.42).

- [ ] **Step 10: Prove the gate can fail**

In `frontend/src/colours.css`, change `--grey: #554B43;` to the site's mute, `--grey: #6B5E54;`, and run the same command.
Expected: FAIL, 48 tests, every `--grey` text case and every `--paper-warm on --grey` case, in both runs. Restore `#554B43` and run again: PASS.

- [ ] **Step 11: Run the whole unit suite, types and lint**

Run: `npm run test:unit && npm run typecheck && npm run lint`
Expected: all exit 0. `test:unit` includes `snapshot.contract.test.ts`, which needs `sbt test` to have run once; if it fails with "no snapshots", run `sbt test` and repeat.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/design/gate.ts frontend/src/design/gate.test.ts frontend/src/design/tokens.gate.test.ts frontend/src/colours.css frontend/src/tokens.css
git commit -m "feat: add the design tokens behind a contrast gate (ui refresh step 3a)" -m "colours.css holds every colour token and tokens.css the rest, the only place a token's value is written; nothing imports them before step 4. The gate, in test:unit, checks every pair of the 3a spec's table at 7:1 for text and 3:1 for indicators under normal vision and the three simulated dichromacies, with and without prefers-contrast: more. Both files are read the same strict way, one :root block then one more block, and every check covers both runs. It also fails on a colour token no pair reaches, on a colour or a stray px in tokens.css, and on a root outside J2's rules."
```

---

### Task 3: The reference's token values (commit 4)

**Files:**
- Modify: `docs/design/ui-reference.md`

**Interfaces:**
- Consumes from Task 2: the file paths `frontend/src/colours.css`, `frontend/src/tokens.css` and `frontend/src/design/gate.ts`, and the token names `--root-size`, `--frame-band`, `--card-back`, `--grey`, `--mute-soft`, `--focus-width`, `--focus-gap`, `--duration`, `--line-control`, `--line-mark`, `--radius-card`, `--target-min`, `--text-2xl`, `--text-3xl`.
- Produces: nothing code reads. 3b reads the reference.

The commit is reviewed as its diff, so the edits below are the review's content. Apply them in order; each "Replace" text occurs exactly once in the file before its edit. Beyond the spec's decisions, edit 24 calls J2's logged clamp the root rather than an example, since it is now `--root-size`'s value, and edit 27 corrects J6's log: ink on paper-pale is 14.77 to 14.78, not 14.78 for all three (Task 1's fixtures).

- [ ] **Step 1: Apply the edits**

**Edit 1: Intro.** Replace:

```markdown
The design reference step 4 applies. Step 3a fills the token values, step 3b
the layouts. Decisions are provisional unless marked **(settled)**, as in the
UI refresh design's "How decisions are marked". The rules come first; the
reasons and the options set aside are in the decisions log at the end.
```

With:

```markdown
The design reference step 4 applies. Step 3a gave the token values, in the
value source, and step 3b draws the layouts. Decisions are provisional unless
marked **(settled)**, as in the UI refresh design's "How decisions are
marked". The rules come first; the reasons and the options set aside are in
the decisions log at the end.
```

**Edit 2: Terms: token and value source.** Replace:

```markdown
- **Token**: a CSS custom property in the token list (principle 6 for
  colours).
- **Token list**: the "Tokens" section, each token with its value and purpose.
  It is the contract between 3a, which gives the values, and 3b, which uses
  them.
  "Role" is not used for this, since voter and facilitator own the word.
```

With:

```markdown
- **Token**: a CSS custom property in the value source (principle 6 for
  colours).
- **Value source**: `frontend/src/colours.css` for the colour tokens and
  `frontend/src/tokens.css` for the rest, the only place a token's value is
  written, each token with a one-line purpose comment. It is the contract
  between 3a, which gave the values, and 3b, which uses them. A token's purpose
  is not called its role, since voter and facilitator own the word.
```

**Edit 3: Brand source: the app's burgundy.** Replace:

```markdown
  so the app's burgundy is about 5% darker, such as `#8E292E` (7.14 and 7.43);
  3a sets the value (J8).
```

With:

```markdown
  so the app's burgundy is about 5% darker, `#8E292E` (7.14 and 7.43) (J8).
- The app takes the site's gist, not its values: lunatech.com was not built
  for contrast, so a value moves wherever J8 needs it, the hue kept.
```

**Edit 4: J2: the root.** Replace:

```markdown
  `:root { font-size: clamp(<min>rem, <a>vmin + <b>rem, <max>rem) }`, values
  from 3a. Its limits are in `rem`, so the reader's default font size counts.
```

With:

```markdown
  `clamp(<min>rem, <a>vmin + <b>rem, <max>rem)`, the `--root-size` token,
  which the contrast gate (J8) checks against the three rules below. Its limits
  are in `rem`, so the reader's default font size counts.
```

**Edit 5: J2: lines.** Replace:

```markdown
- `px` only for the hairline token. Every other line (the Lines tokens but the
  hairline: control lines, message bars, the focus ring) is in `rem` with a
  pixel floor, such as `max(2px, 0.15rem)`, so it scales with the root and never
  rounds to nothing.
```

With:

```markdown
- `px` only for the hairline token and inside a pixel floor. Every other line
  (the Lines tokens but the hairline: control lines, J3's marks, the kept
  frame's band, message bars, the focus ring) is in `rem` with a pixel floor,
  such as `max(2px, 0.125rem)`, so it scales with the root and never rounds to
  nothing. The gate checks both in `tokens.css`.
```

**Edit 6: J3: entry table.** Replace:

```markdown
| Kept | hatching | the value and a "not confirmed" pill |
```

With:

```markdown
| Kept | kept frame | the value and a "not confirmed" tag |
```

**Edit 7: J3: card table.** Replace:

```markdown
| Chosen, kept | a hatched frame around the figure, and a "not confirmed" pill |
| Revealed | all disabled, the phase line says why; the chosen one keeps its look, fill or hatched frame; faded within J8 |
```

With:

```markdown
| Chosen, kept | the kept frame around the figure, and a "not confirmed" tag |
| Revealed | all disabled, the phase line says why; the chosen one keeps its look, fill or kept frame, faded to the grey (J8) |
```

**Edit 8: J3: no tag while voting.** Replace:

```markdown
- No pill on a kept entry while voting: the hatching carries it, and the
  accessible name says it.
- **Solid fill** and **hatching** are each defined once, on entries and cards
  alike. The hatching frames a card's figure, so the figure stays on paper and
  in line with the others.
- The card's pill is `aria-hidden`
```

With:

```markdown
- No tag on a kept entry while voting: the kept frame carries it, and the
  accessible name says it.
- **Solid fill** and the **kept frame** are each defined once, on entries and
  cards alike, both in the card back's colour (J4). The solid fill covers the
  mark or the card. The kept frame is a solid band around a paper centre: on a
  card the band is `--frame-band`, a fixed line; on an entry it is a fifth of
  its mark's width in the mark's viewBox, the stroke inset. The frame surrounds
  a card's figure, so the figure stays on paper and in line with the others.
  Outline, kept frame and fill read as no fill, some, full: no estimate, kept,
  confirmed.
- A card's size is 3b's, with a token 3b adds: a kept card shows its widest
  figure inside the band with room around it (L5).
- The card's tag is `aria-hidden`
```

**Edit 9: J3: the tile check.** Replace:

```markdown
- 3b checks the hatching on screenshots shrunk to a 480 by 270 video tile, and
  from a few metres away.
```

With:

```markdown
- 3b checks the kept frame on screenshots shrunk to a 480 by 270 video tile,
  and from a few metres away, on the smallest entry mark too (L3). If it fails
  there, 3b sends the band back to 3a (Tokens).
```

**Edit 10: J3: forced colours.** Replace:

```markdown
- **Forced colours** (Windows' contrast themes) repaint backgrounds and drop
  gradients, which would erase the fill and the hatching:
  - an entry's mark and a card's hatched frame are inline SVG drawn in an
    inherited `currentColor`, which the browser repaints in the user's colours
    with no opt-out;
```

With:

```markdown
- **Forced colours** (Windows' contrast themes) repaint backgrounds, which
  would erase the fill:
  - a card's kept frame is its border, and an entry's mark is inline SVG drawn
    in an inherited `currentColor`; the browser repaints both in the user's
    colours with no opt-out;
```

**Edit 11: J4: the card back.** Replace:

```markdown
- Every J3 state is drawn in ink.
```

With:

```markdown
- Every J3 state is drawn in the card back's colour, `--card-back`, which is
  ink. 3b tries burgundy on the assembled mockups and the product owner
  chooses; burgundy would reopen this rule.
```

**Edit 12: J7: licences and the shared-screen size.** Replace:

```markdown
- The app serves the fonts, not Google's CDN. 3a confirms the licence of all
  three families allows it.
```

With:

```markdown
- The app serves the fonts, not Google's CDN. All three families are SIL OFL
  1.1 with no Reserved Font Name (google/fonts, `OFL.txt` and `METADATA.pb`),
  so subsetting and woff2 need no renaming, and the licence text ships beside
  the files.
- **Shared-screen text** is sized for 4 m on a 40 inch TV at the laptop
  target: the `--text-3xl` step, 44 px. 3b may drop one element to the 3 m
  step, `--text-2xl`, said so in the log.
```

**Edit 13: J8: supporting text.** Replace:

```markdown
  Supporting text is told by size and weight, or by a grey 3a computes to reach
  7:1.
```

With:

```markdown
  Supporting text is `--grey`, at the body size; the hierarchy comes from a
  600-weight lead in ink. No text is italic.
```

**Edit 14: J8: focus tokens.** Replace:

```markdown
- **Focus** is an ink `outline`, at least 2 px thick and offset by a gap of at
  least 2 px, both in `rem` with a floor (J2); never a `box-shadow`, which
  forced colours remove.
```

With:

```markdown
- **Focus** is an ink `outline`, at least 2 px thick and offset by a gap of at
  least 2 px, `--focus-width` and `--focus-gap` (J2); never a `box-shadow`,
  which forced colours remove.
```

**Edit 15: J8: more, frozen deck and the gate.** Replace:

```markdown
- Under `prefers-contrast: more`, hairlines and the hatching darken, to values
  3a gives as tokens.
- The frozen deck keeps every figure at 7:1, under every simulation too, though
  WCAG exempts disabled controls. Its figures and the chosen card's fill or
  frame may fade toward paper only that far (about `#5A5553`, a 3a token), and
  the unchosen cards' edges may use the hairline's width and colour tokens,
  which 1.4.11 allows on a disabled control; the phase line says why it is
  frozen. 3b picks the level on the mockups, and whether the fill fades. Nothing
  fades under forced colours.
- 3a's script checks each text and indicator colour at its floor on every ground
  it can sit on: paper, paper-warm or white, paper-pale, the burgundy tint over
  each surface a message sits on, the ink fill (a confirmed card's figure), the
  faded fill (a frozen chosen card's figure) and burgundy (the primary's label).
  The colour-blind simulations (Machado 2009, full severity) are a gate at the
  same floors, not a report.
```

With:

```markdown
- Under `prefers-contrast: more`, the hairline colour turns `--mute-soft`, an
  indicator at 3:1, and the control line takes the mark line's weight.
- The frozen deck keeps every figure at 7:1, under every simulation too, though
  WCAG exempts disabled controls. Its figures and the chosen card's fill or
  frame fade to `--grey`, whatever the card back, and the unchosen cards' edges
  may use the hairline's width and colour tokens, which 1.4.11 allows on a
  disabled control; the phase line says why it is frozen. Nothing fades under
  forced colours.
- **The contrast gate**, a Vitest test in `test:unit`, checks each text and
  indicator colour at its floor on every ground it can sit on, under normal
  vision and the colour-blind simulations (Machado 2009, full severity): a gate
  at the same floors, not a report. Its pairs are listed in
  `frontend/src/design/gate.ts` and follow the value source's current values.
  It checks pairs of tokens, not rendered pages: a component that puts a
  foreground on a ground outside the list escapes it until review catches it
  or the pair is added.
```

**Edit 16: J9: motion.** Replace:

```markdown
  button changing state, each at most 200 ms, and none under
```

With:

```markdown
  button changing state, each `--duration` long (at most 200 ms), and none under
```

**Edit 17: J9: surfaces and shapes.** Replace:

```markdown
- **Surfaces**: the page on paper, content surfaces on paper-warm or white
  (3a's choice), told apart by a hairline, not a shadow.
- **No dark sections**: one light theme (principle 6).
- **Shapes**: lunatech.com's corner radius and border widths, measured in 3a
  and turned into the Shape and Lines tokens (J2), within J8's 3:1 for
  indicators.
```

With:

```markdown
- **Surfaces**: the page on paper, content surfaces on paper-warm, told apart
  by a hairline, not a shadow.
- **No dark sections**: one light theme (principle 6).
- **Shapes**: lunatech.com's, as measured on 2026-10-07: corners square but the
  scrollbars' 2 and 3 px and the 50% dots; 1 px lines; 2 and 3 px burgundy
  bars; a 2 px focus outline, offset 2 px; transitions of 0.18 to 0.25 s;
  buttons at least 44 px tall, kept as `--target-min`.
- **Corners** are square but on cards, the deck's and L3's card entries, which
  take `--radius-card`. Buttons, inputs, surfaces, messages and the "not
  confirmed" tag stay square.
- **Two line weights**: controls keep the brand's 1 px line, `--line-control`;
  J3's marks take 2 px, `--line-mark`; both within J8's 3:1 for indicators.
```

**Edit 18: Tokens.** Replace:

```markdown
3a fills this list with each token's name, value and purpose. Every colour,
size, font and duration in a component's CSS comes from it (principle 6 for
colours), except CSS keywords such as system colours and `currentColor`, and
L11's values in media queries, which cannot read a token.

| Kind | Tokens |
| --- | --- |
| Colour | paper, paper-warm or white (J9), paper-pale, pale for hairlines, ink, a supporting-text grey at 7:1 (J8), the app's burgundy (Brand source), burgundy-deep, the burgundy tint, the frozen-deck grey (J8), or the supporting grey if 3a finds one serves both |
| Root | the clamp's minimum, `vmin` and `rem` terms, and maximum (J2) |
| Shell | its height, `100dvh` (J2) |
| Type | the families (J7); the scale, the weights |
| Spacing | one scale |
| Shape | corner radii (J9) |
| Lines | the hairline in `px`; the control line (outlines, card edges, marks, frames); the message bar; the focus ring and its gap (J2, J8) |
| Pattern | the hatching's angle, stripe and gap (J3) |
| Motion | the one duration (J9) |

- 3b may add a token a layout needs: it adds it here, and its reason to the
  log.
```

With:

```markdown
The value source (Terms) holds every token's value and purpose; this section
keeps the kinds and the rules, and no value is written twice. Every colour,
size, font and duration in a component's CSS comes from a token (principle 6
for colours), except CSS keywords such as system colours and `currentColor`,
and L11's values in media queries, which cannot read a token.

| Kind | Tokens |
| --- | --- |
| Colour | the papers, pale and ink (Brand source), the supporting grey (J8), the app's burgundy, burgundy-deep and its tint, the hairline colour and its `more` value (J8), the card back (J4) |
| Root | the clamp (J2) |
| Shell | its height (J2) |
| Type | the families (J7); the scale's steps, the weights, the leadings, the label tracking |
| Spacing | one scale |
| Shape | the radii (J9); the least target size |
| Lines | the hairline in `px`; the control line, the mark line, the kept frame's band, the message bar, the focus ring and its gap (J2, J8) |
| Motion | the one duration (J9) |

- Nothing imports the value source before step 4; 3b's mockups link both
  files. The gate (J8) also checks what each file may hold, and J2's root.
- An alias exists only where its value can differ from its source, such as the
  card back.
- The type scale is named by steps, not roles, so 3b assigns a step to an
  element without renaming a token. It is provisional until 3b's assembled
  mockups judge it.
- 3b may add a token a layout needs: it adds it to the value source, and its
  reason to the log.
```

**Edit 19: Contract reads: the tag.** Replace:

```markdown
  alone (`toHaveText('5')`). J3's pill, `aria-hidden` and outside the button,
```

With:

```markdown
  alone (`toHaveText('5')`). J3's tag, `aria-hidden` and outside the button,
```

**Edit 20: Open: L1.** Replace:

```markdown
- **L1. Each page's structure per phase**, the phase line included.
```

With:

```markdown
- **L1. Each page's structure per phase**, the phase line included. A
  50-character ticket link fits the issue's one line at the laptop target, at
  J7's shared-screen size; a longer issue wraps, never truncated, until a
  clickable-link step brings an ellipsis that keeps the link's end.
```

**Edit 21: Open: L3.** Replace:

```markdown
  two choices.
- **L4.
```

With:

```markdown
  two choices. The kept frame is checked on the smallest entry mark (J3).
- **L4.
```

**Edit 22: Open: L5.** Replace:

```markdown
- **L5. How the deck reflows** on narrow screens and phones.
```

With:

```markdown
- **L5. How the deck reflows** on narrow screens and phones, and the card's
  size (J3). A card fits its widest figure, "0.5"; for a narrower card, every
  shown `0.5` may read "½" instead, a contract change of step 4: the card's
  name, and the `most-voted`, `tally-value` and `participant-estimation` text,
  which `expectSummaryMatchesParticipants` compares, all through one display.
```

**Edit 23: Open: L7.** Replace:

```markdown
- **L7. The issue editor** and its messages.
```

With:

```markdown
- **L7. The issue editor** and its messages, within L1's one-line issue.
```

**Edit 24: Log: J2.** Replace:

```markdown
  text stayed flat from 125% to 200%. With the example `clamp(1rem, 1.05vmin +
  0.5rem, 1.75rem)`, 200% zoom doubles the text at J1's target and the hand
```

With:

```markdown
  text stayed flat from 125% to 200%. With the root `clamp(1rem, 1.05vmin +
  0.5rem, 1.75rem)`, 200% zoom doubles the text at J1's target and the hand
```

**Edit 25: Log: J3.** Replace:

```markdown
  opting every mark or the kept frame out of forced colours, when SVG needs no
  opt-out; mark names fitted to today's substring reads ("Voted, vote
  hidden"), which writes them for the tests rather than the listener; "your
  last vote" on the card, a second wording for one state.
```

With:

```markdown
  opting every mark or the kept frame out of forced colours, when a border and
  SVG need none; mark names fitted to today's substring reads ("Voted, vote
  hidden"), which writes them for the tests rather than the listener; "your
  last vote" on the card, a second wording for one state. The kept frame
  replaced the hatching in 3a: it reads as focused where hatching blurred, at
  full size and at the tile. Set aside: hatching; partial borders (top and
  bottom, left and right); a card band a fifth of a card width 3a would have
  had to guess before 3b's layouts. The pill was renamed the tag in 3a.
```

**Edit 26: Log: J4.** Replace:

```markdown
  Set aside: burgundy for states; the chosen card in burgundy and entries in
  ink, which gives one state two colours.
```

With:

```markdown
  Set aside: burgundy for states; the chosen card in burgundy and entries in
  ink, which gives one state two colours. A burgundy card back cannot fade
  within 7:1 (paper-warm on it 7.31 at full strength, 6.61 at 95%, at worst),
  hence the frozen card fades to the grey whatever the back; a blue back was
  set aside, a colour from outside the brand.
```

**Edit 27: Log: J6.** Replace:

```markdown
deuteranopia 10.07, tritanopia 10.75); ink on paper-pale 14.78 for all
  three.
```

With:

```markdown
deuteranopia 10.07, tritanopia 10.75); ink on paper-pale 14.77 to 14.78
  for all three.
```

**Edit 28: Log: J7.** Replace:

```markdown
  CDN font. Set aside: the serif for the issue; system fonts only; Space
  Grotesk, which the site uses only in places.
```

With:

```markdown
  CDN font. Set aside: the serif for the issue; system fonts only; Space
  Grotesk, which the site uses only in places. Shared-screen text: cap height
  at least a two-hundredth of the distance, at 0.65 mm per CSS px measured on a
  40 inch TV, is 44 px of DM Sans (cap 0.70 em); a 3 m or a 5 m target set
  aside.
```

**Edit 29: Log: J8.** Replace:

```markdown
  disabled look. Set aside: a 4.5:1 exception for disabled cards.
```

With:

```markdown
  disabled look. Set aside: a 4.5:1 exception for disabled cards. `--grey` is
  the lightest grey found on the site's mute hue at 7:1 on every ground under
  every vision, so one grey serves supporting text and the frozen deck. Set
  aside: italics and a smaller helper. The gate composites a ground with alpha
  in sRGB, rounded to 8 bits as the browser paints it, and applies the
  simulations in linear RGB; that method reproduces every figure in Brand
  source and the J6 log, and the gamma-space variant does not.
```

**Edit 30: Log: J9.** Replace:

```markdown
- **J9.** A projector or a video tile loses a shadow and a dark page's contrast
  in a lit room.
```

With:

```markdown
- **J9.** A projector or a video tile loses a shadow and a dark page's contrast
  in a lit room. A playing card's corner tells a card from a button; the site's
  corners are square. Set aside: a 1 px or a 2 px line everywhere.
```

**Edit 31: Log: 3a.** Replace:

```markdown
- **Review.** A review with three lenses
```

With:

```markdown
- **3a.** The token values, the gate and the kept frame came with their own
  spec, `docs/superpowers/specs/2026-10-07-ui-refresh-3a-tokens-design.md`.
- **Review.** A review with three lenses
```

- [ ] **Step 2: Check nothing was missed**

Run: `grep -n -i 'hatch\|pill\|white\|token list\|5A5553\|Pattern' docs/design/ui-reference.md`
Expected: only the Brand source's "White on burgundy" and "white on it" figures, the J3 log's "a pill does not register" and "the pill for not confirmed", the new J3 log sentences on hatching and on the pill's renaming, and the Review log's "the card's pill outside its button". Each is a dated reason, not a rule.

Run: `awk 'length > 80 && !/^\|/ {print FNR": "length}' docs/design/ui-reference.md`
Expected: only line 4, the Status line, which was already longer.

- [ ] **Step 3: Read the diff once as a reviewer would**

Run: `git diff --stat docs/design/ui-reference.md && git diff docs/design/ui-reference.md`
Expected: one file changed. Check that every token name in the diff exists in `frontend/src/colours.css` or `frontend/src/tokens.css`:

```bash
git diff docs/design/ui-reference.md | grep -o -- '`--[a-z0-9-]*`' | tr -d '`' | sort -u | while read t; do grep -q -- "$t:" frontend/src/colours.css frontend/src/tokens.css || echo "missing $t"; done
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add docs/design/ui-reference.md
git commit -m "docs: give the design reference its token values (ui refresh step 3a)" -m "The Tokens section and the Terms point to the value source, colours.css and tokens.css, instead of holding values. J2, J3, J4, J7, J8 and J9 follow the 3a spec's decisions: the kept frame replaces the hatching, the pill is the tag, the card back is a token, one grey serves supporting text and the frozen deck, and the contrast gate replaces the contrast script. J7 records the fonts' licences and J9 lunatech.com's measured shapes. The open questions gain the frame's check on the smallest entry, the one-line issue and the card's size, with \"½\" as 3b's option. The log takes each reason, and J6's ink on paper-pale figure is corrected to 14.77 to 14.78."
```
