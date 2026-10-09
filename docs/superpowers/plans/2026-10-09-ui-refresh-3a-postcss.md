# UI Refresh Step 3a: The Gate Reads CSS with PostCSS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the gate's hand-written CSS parsing with PostCSS and `postcss-value-parser`, so that comments and quoted strings never reach a check.

**Architecture:**
- `parseRuns` reads the PostCSS tree instead of stripping comments, splitting on semicolons and matching the file's shape with a regex.
- `tokenProblems` walks each value's nodes instead of scanning the text with regexes.
- The messages, the run model, the pairs, `rootProblems` and `contrast.ts` are unchanged.
- The behaviour changes:
  - a unit inside a quoted string, as in `'Inter 18pt'`, no longer fails (F2 of the narrow re-review);
  - `!important` on a token fails in both files, where before it failed only in `colours.css`.

**Tech Stack:** TypeScript ~5.9 (strict), Vitest 5, `postcss` 8 (already installed through Vite, now declared), `postcss-value-parser` 4 (one package, no dependencies).

**Spec:** `docs/superpowers/specs/2026-10-07-ui-refresh-3a-tokens-design.md`, section "Parsing". It still describes the 3a branch, so this plan edits it.

**Origin:** the library spike of 2026-10-09:
- culori was rejected because it applies Machado's matrices to gamma-encoded sRGB, and 11 of the 21 simulated fixtures fail.
- stylelint was deferred to step 4, because three of the gate's rules would need a plugin and it adds about 85 packages.
- Every code block below was run in a throwaway worktree on `da0679e`, with the test, typecheck and lint results quoted under each step.

## Global Constraints

**Branch and commit:**
- Branch `20260930.ui_refresh_3a_tokens`, PR #443. This plan adds one commit on top of `da0679e`.
- Do not amend or force-push.
- Commit subject, verbatim: `refactor: read the token files with PostCSS (ui refresh step 3a)`.
- No "Generated with Claude Code" or co-author line.

**Code:**
- Code comments are one or two lines.
- Imports are extension-less, as in the rest of `frontend/src`.
- Every existing test in `frontend/src/design/` passes unchanged. The only test edits are the three additions in Step 1.
- Run every command from the repository root.

## Review Focus

1. **A comment inside a value,** such as `--a: #000 /* x */;`. PostCSS leaves the comment out of `decl.value`, as the old comment stripping did. *Checked by a probe, no test.*
2. **`!important`.** PostCSS moves it out of the value into `decl.important`, so the gate must reject the flag, or `#000 !important` would pass quietly. Pinned by "fails on !important".
3. **A second rule inside the more block.** The old regex rejected it, but no test covered it. Pinned by the new shape case.
4. **Malformed input.** An unclosed brace throws PostCSS's `CssSyntaxError` ("Unclosed block"). A malformed number such as `1..0px` reads as the unit `..0px` and fails. `calc(1rem-2vw)` reads as the unit `rem-2vw` and fails. *Checked by a probe.*
5. **Colour names stay unchecked in `tokens.css`.** `--a: red` passes before and after this change. It is a separate decision, and this plan doesn't change it.

---

### Task 1: Read the token files with PostCSS

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `frontend/src/design/gate.ts`
- Test: `frontend/src/design/gate.test.ts`
- Modify: `docs/superpowers/specs/2026-10-07-ui-refresh-3a-tokens-design.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: the same exports as today, `parseTokens`, `parseColours` and `tokenProblems`, with unchanged signatures and messages.

- [ ] **Step 1: Add the three tests**

In `gate.test.ts`, under `describe('reading colours.css')`, extend the `fails on %s` list with a last entry. The previous entry gains a trailing comma:

```ts
    ['another media query', ':root { --a: #000000; }\n@media (prefers-color-scheme: dark) { :root { } }'],
    ['a second rule in the more block', ':root { }\n@media (prefers-contrast: more) { :root { } .card { } }']
```

After the `fails on the value %j` test, add:

```ts
  it('fails on !important', () => {
    expect(() => parseColours(file('--a: #000000 !important;')))
      .toThrow('not a custom property in :root: --a: #000000 !important')
  })
```

Under `describe('what tokens.css may hold')`, after the `fails on %s` table, add:

```ts
  it('allows a unit inside a quoted font name', () => {
    expect(problems("--a: 'Inter 18pt', sans-serif;")).toEqual([])
  })
```

- [ ] **Step 2: Run them on the current gate**

Run: `npx vitest run --root frontend src/design/gate.test.ts`

Expected: 2 failed, 54 passed (56).
- "fails on !important" gets `not a hex or an rgba() colour: #000000 !important`.
- "allows a unit inside a quoted font name" gets `['--a: the unit pt in ...']`.
- The more-block case passes, because the old regex rejects it. Its teeth are shown in Step 6.

- [ ] **Step 3: Declare the two packages**

Run: `npm install -D postcss postcss-value-parser`

Expected: `package.json` gains `"postcss": "^8.5.x"` and `"postcss-value-parser": "^4.2.0"` under `devDependencies`. The lockfile gains one package, `postcss-value-parser`; the spike counted 233 packages before and 234 after.

- [ ] **Step 4: Rewrite the parsing**

In `gate.ts`, replace everything from the first line through `export const parseTokens = ...` with:

```ts
import postcss, { type AtRule, type ChildNode, type Container, type Rule } from 'postcss'
import valueParser, { type Node } from 'postcss-value-parser'
import { composite, parseColour, type Rgba } from './contrast'

export const TEXT = 7
export const INDICATOR = 3

export type Run = 'base' | 'more'
export type Tokens = ReadonlyMap<string, string>
export type Ground = { token: string; over?: string }
export type Pair = { foreground: string; ground: Ground; floor: number }

const reference = (value: string) => /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(value)?.[1]

const content = (container: Container) => container.nodes?.filter(node => node.type !== 'comment') ?? []
const isRoot = (node?: ChildNode): node is Rule => node?.type === 'rule' && node.selector.toLowerCase() === ':root'
const isMore = (node?: ChildNode): node is AtRule => node?.type === 'atrule' && /^media$/i.test(node.name) &&
  /^\(\s*prefers-contrast\s*:\s*more\s*\)$/i.test(node.params)

const block = (rule: Rule, where: string): Map<string, string> => {
  const tokens = new Map<string, string>()
  for (const node of content(rule)) {
    // A value holds no colon, so a missing semicolon cannot merge two declarations.
    if (node.type !== 'decl' || !node.prop.startsWith('--') || node.value.includes(':') || node.important) {
      throw new Error(`not a custom property in ${where}: ${node.toString()}`)
    }
    if (tokens.has(node.prop)) throw new Error(`${node.prop} is declared twice in ${where}`)
    tokens.set(node.prop, node.value.trim())
  }
  return tokens
}

// Both token files: the base run is the :root block; the more run lays the more block over it.
const parseRuns = (css: string, file: string): Record<Run, Tokens> => {
  const [root, media, ...rest] = content(postcss.parse(css))
  const [more, ...others] = isMore(media) ? content(media) : []
  if (!isRoot(root) || !isRoot(more) || rest.length > 0 || others.length > 0) {
    throw new Error(`${file} must hold one :root block, then one @media (prefers-contrast: more) block`)
  }
  const base = block(root, ':root')
  return { base, more: new Map([...base, ...block(more, 'the more block')]) }
}

export const parseTokens = (css: string) => parseRuns(css, 'tokens.css')
```

Then replace everything from `const allowedFunctions` up to, but not including, `const defaultRoot` with:

```ts
// '' allows bare parentheses and a number with no unit.
const allowedFunctions = new Set(['', 'calc', 'min', 'max', 'clamp', 'var'])
const allowedUnits = new Set(['', 'rem', 'em', 'ms', 'px'])
// J2: the viewport appears only in the root and the shell's height.
const unitOnlyOn: Record<string, string> = { vmin: '--root-size', dvh: '--shell-height' }

// Each node of a value with the name of the function it sits directly in.
const walk = (nodes: Node[], visit: (node: Node, inside?: string) => void, inside?: string) => {
  for (const node of nodes) {
    visit(node, inside)
    if (node.type === 'function') walk(node.nodes, visit, node.value.toLowerCase())
  }
}

// tokens.css: no colour, no var() to one, J2's units, no px outside a floor but the hairline's.
export const tokenProblems = (
  runs: Record<Run, Tokens>, colourNames: ReadonlySet<string>
): string[] => {
  const problems = new Set<string>()
  for (const [name, value] of [...runs.base, ...runs.more]) {
    const say = (what: string) => problems.add(`${name}: ${what} in ${value}`)
    if (colourNames.has(name)) problems.add(`${name} is a colour token, declared in colours.css`)
    walk(valueParser(value).nodes, (node, inside) => {
      if (node.type === 'function' && !allowedFunctions.has(node.value.toLowerCase())) say(`${node.value}()`)
      if (node.type !== 'word') return
      if (node.value.startsWith('#')) say('a hex colour')
      if (/^(transparent|currentcolor)$/i.test(node.value)) say(node.value)
      if (inside === 'var' && colourNames.has(node.value)) say(`a colour token, ${node.value}`)
      const unit = valueParser.unit(node.value)
      if (!unit) return
      const lower = unit.unit.toLowerCase()
      if (!allowedUnits.has(lower) && unitOnlyOn[lower] !== name) say(`the unit ${unit.unit}`)
      if (lower === 'px' && inside !== 'max' && name !== '--line-hairline') say('a px outside max()')
    })
  }
  return [...problems]
}

```

- [ ] **Step 5: Run the suite, typecheck and lint**

Run: `npm run test:unit && npm run typecheck && npm run lint`

Expected:
- The suite passes 412 of 412: today's 409 plus the three tests from Step 1. The spike's worktree had no server snapshots, so it saw 402 passed and 1 failed. In the main checkout, `snapshot.contract.test.ts` finds them in `target/contract/`.
- Typecheck and lint print no errors.

- [ ] **Step 6: Prove the new checks have teeth**

Apply each mutation to `gate.ts` alone, run `npx vitest run --root frontend src/design/gate.test.ts`, then restore the file with `git checkout -- frontend/src/design/gate.ts` before the next mutation. Re-apply Step 4 afterwards if the checkout reverted it, or keep a copy.

| Mutation | Expected |
|---|---|
| remove ` \|\| node.important` | 1 failed: "fails on !important" |
| remove ` \|\| others.length > 0` | 1 failed: "fails on a second rule in the more block" |
| remove `!isRoot(more) \|\| ` | 1 failed |
| make the unit line `if (false) say(...)` | 6 failed |
| remove `inside !== 'max' && ` | 1 failed |

The F2 test needs no mutation: the tokenizer, not a check, keeps the string away from the unit check. Step 2 already showed it fails on the regex version.

- [ ] **Step 7: Edit the spec's Parsing section**

In `docs/superpowers/specs/2026-10-07-ui-refresh-3a-tokens-design.md`, replace:

```
**Parsing.** The gate finds the files through `import.meta.url`, as
`snapshot.contract.test.ts` does, and strips comments. Each file holds one
```

with:

```
**Parsing.** The gate finds the files through `import.meta.url`, as
`snapshot.contract.test.ts` does, and reads them with PostCSS and
`postcss-value-parser`, so a comment or a quoted string never reaches a
check. Each file holds one
```

Then replace:

```
- any other rule in either file, a token declared twice in one block, or a
  colour token declared in `tokens.css`;
```

with:

```
- any other rule in either file, a token declared twice in one block or with
  `!important`, or a colour token declared in `tokens.css`;
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json frontend/src/design/gate.ts frontend/src/design/gate.test.ts \
  docs/superpowers/specs/2026-10-07-ui-refresh-3a-tokens-design.md
git commit -m "refactor: read the token files with PostCSS (ui refresh step 3a)" -m "The gate parsed the CSS with regexes, and each review found a gap in them. PostCSS and postcss-value-parser now read the files and the values, so comments and quoted strings never reach a check. A unit in a quoted font name no longer fails, and !important fails in both files."
```

Expected: one new commit on `da0679e`, and a clean working tree.
