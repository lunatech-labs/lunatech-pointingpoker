# UI Refresh Step 3a: Only the Generic Font Families as Words in tokens.css

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the colour-name gap: `--a: red` passes in `tokens.css` despite decision 1.

**Architecture:**
- Among bare words, the gate checks only `transparent` and `currentColor`, so `red`, `Canvas`, `inherit` and `bold` pass.
- Every bare word in `tokens.css` today is a generic font family on a font token: `system-ui`, `sans-serif`, `ui-monospace`, `monospace`, `ui-serif`, `serif`. Quoted names such as `'DM Sans'` are strings, which the gate skips.
- A word must now be one of those six, in any case, with two exceptions: a `--name` inside `var()`, and the operators `+ - * /` that `postcss-value-parser` reads as words inside `calc()`.
- This is the same closed-list shape as the units and functions.
- The `transparent`/`currentColor` check folds into the new one, so those two now fail as "the word Transparent", not "Transparent". Two test messages change.
- A `--name` outside `var()` now fails too.

**Tech Stack:** TypeScript ~5.9 (strict), Vitest 5, `postcss-value-parser` 4.

**Spec:** `docs/superpowers/specs/2026-10-07-ui-refresh-3a-tokens-design.md`, section "Parsing". This plan edits its last bullet.

**Origin:**
- The colour-name gap, found in the library spike of 2026-10-09. The user chose option (a), an allow-list of words, over a deny-list of named colours or deferring to stylelint's `color-named` in step 4.
- Every code block below was run in the working tree on `6f53211`, with the mutation results quoted in Step 5.

## Global Constraints

**Branch and commit:**
- Branch `20260930.ui_refresh_3a_tokens`, PR #443. This plan adds one commit after it is committed.
- Do not amend or force-push.
- Commit subject, verbatim: `fix: allow only the generic font families as words in tokens.css (ui refresh step 3a)`.
- No "Generated with Claude Code" or co-author line.

**Code:**
- Code comments are one or two lines.
- The only test edits are the ones in Step 1.
- Run every command from the repository root.

## Review Focus

1. **A future word.** An easing such as `ease-out` or a keyword such as `normal` fails until it is added to `allowedWords`. That is intended: the entry shows up in review.
2. **A hex.** `#fff` has no unit, so it reaches the word branch, which says "a hex colour" for it, not "the word #fff". The existing row pins the message.
3. **The real file.** `tokens.gate.test.ts` reads `tokens.css` and passes unchanged.

---

### Task 1: An allow-list of words

**Files:**
- Modify: `frontend/src/design/gate.ts`
- Test: `frontend/src/design/gate.test.ts`
- Modify: `docs/superpowers/specs/2026-10-07-ui-refresh-3a-tokens-design.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: the same exports and signatures as `6f53211`. Messages are unchanged but for `transparent` and `currentColor`.

- [ ] **Step 1: Edit the tests**

In `gate.test.ts`, under `describe('what tokens.css may hold')`, replace these two rows of the `fails on %s` table:

```ts
    ['--a: Transparent;', '--a: Transparent in Transparent'],
    ['--a: CURRENTCOLOR;', '--a: CURRENTCOLOR in CURRENTCOLOR'],
```

with:

```ts
    ['--a: Transparent;', '--a: the word Transparent in Transparent'],
    ['--a: CURRENTCOLOR;', '--a: the word CURRENTCOLOR in CURRENTCOLOR'],
    ['--a: red;', '--a: the word red in red'],
    ['--a: Canvas;', '--a: the word Canvas in Canvas'],
    ['--a: --b;', '--a: the word --b in --b'],
```

Then put this before `it('allows a unit inside a quoted font name', ...)`:

```ts
  it('allows the generic font families in any case, and calc()\'s operators', () => {
    const fine = '--a: system-ui, SANS-SERIF, ui-monospace, monospace, ui-serif, serif; --b: calc(1rem + 2rem - 1rem * 2 / 3);'
    expect(problems(fine)).toEqual([])
  })
```

- [ ] **Step 2: Run them on the current gate**

Run: `npx vitest run --root frontend src/design/gate.test.ts`

Expected: 5 failed, 61 passed (66). The five rows fail. The new allow test passes, since today's gate allows every word. Step 5 shows its teeth.

- [ ] **Step 3: Check the words**

In `gate.ts`, after the `unitOnlyOn` line, add:

```ts
// The generic font families; any other word, a colour name included, fails.
const allowedWords = new Set(['system-ui', 'sans-serif', 'ui-monospace', 'monospace', 'ui-serif', 'serif'])
```

In `tokenProblems`, replace:

```ts
      if (node.type !== 'word') return
      if (node.value.startsWith('#')) say('a hex colour')
      if (/^(transparent|currentcolor)$/i.test(node.value)) say(node.value)
      if (inside === 'var' && colourNames.has(node.value)) say(`a colour token, ${node.value}`)
      const unit = valueParser.unit(node.value)
      if (!unit) return
```

with:

```ts
      if (node.type !== 'word' || ['+', '-', '*', '/'].includes(node.value)) return
      if (inside === 'var' && node.value.startsWith('--')) {
        if (colourNames.has(node.value)) say(`a colour token, ${node.value}`)
        return
      }
      const unit = valueParser.unit(node.value)
      if (!unit) {
        if (node.value.startsWith('#')) say('a hex colour')
        else if (!allowedWords.has(node.value.toLowerCase())) say(`the word ${node.value}`)
        return
      }
```

- [ ] **Step 4: Run the suite, typecheck and lint**

Run: `npm run test:unit && npm run typecheck && npm run lint`

Expected: 422 of 422 pass, which is the 418 at `6f53211` plus 4. Typecheck and lint print no errors.

- [ ] **Step 5: Prove each part has teeth**

Apply each mutation to `gate.ts` alone, run `npx vitest run --root frontend src/design/gate.test.ts`, then restore the Step 3 version before the next mutation.

| Mutation | Expected |
|---|---|
| remove the `else if (!allowedWords...)` line | 5 failed: the five rows from Step 1 |
| `allowedWords.has(node.value.toLowerCase())` becomes `allowedWords.has(node.value)` | 1 failed: the allow test |
| drop `'serif'` from `allowedWords` | 1 failed: the allow test |
| `inside === 'var' && ` removed | 1 failed: "fails on --a: --b;" |
| drop `'/'` from the operators | 1 failed: the allow test |
| drop `'-'` from the operators | 2 failed: the allow test and "fails on --a: calc(1rem - -.5pt);" |
| remove the `colourNames.has` line | 1 failed: "fails on --a: var(--ink);" |

- [ ] **Step 6: Edit the spec's Parsing section**

In `docs/superpowers/specs/2026-10-07-ui-refresh-3a-tokens-design.md`, replace:

```
- in `tokens.css`, a function but `calc()`, `min()`, `max()`, `clamp()` and
  `var()`, a hex, `transparent` or `currentColor` in any case, or a `var()` to
  a token `colours.css` declares (decision 1).
```

with:

```
- in `tokens.css`, a function but `calc()`, `min()`, `max()`, `clamp()` and
  `var()`, a hex, a word but a generic font family (`system-ui`, `sans-serif`,
  `ui-monospace`, `monospace`, `ui-serif`, `serif`) in any case, or a `var()`
  to a token `colours.css` declares (decision 1).
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/design/gate.ts frontend/src/design/gate.test.ts \
  docs/superpowers/specs/2026-10-07-ui-refresh-3a-tokens-design.md
git commit -m "fix: allow only the generic font families as words in tokens.css (ui refresh step 3a)" -m "Decision 1 keeps colours out of tokens.css, yet a colour name such as red passed: among words the gate checked only transparent and currentColor. A bare word must now be a generic font family, which also stops system colours and CSS-wide keywords; transparent and currentColor fail as words."
```

Expected: one new commit, and a clean working tree.
