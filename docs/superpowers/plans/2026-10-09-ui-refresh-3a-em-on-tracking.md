# UI Refresh Step 3a: `em` Only on the Label Tracking

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow `em` in `tokens.css` only on `--tracking-label`, and say so in J2.

**Architecture:**
- J2 says every size but the root is in `rem`, yet the gate allows `em` on every token, so `--space-md: 1em` passes.
- `--tracking-label: 0.12em` is the one `em` today, and it is right there: letter spacing follows its own text.
- `em` moves from `allowedUnits` to `unitOnlyOn`, beside `vmin` on the root and `dvh` on the shell.

**Tech Stack:** TypeScript ~5.9 (strict), Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-07-ui-refresh-3a-tokens-design.md`, section "Parsing", and J2 in `docs/design/ui-reference.md`. This plan edits both.

**Origin:**
- Finding F1 of the narrow re-review of PR #443. The user chose option (a) on 2026-10-09.
- Every code block below was run in the working tree on `2a4ef77`.

## Global Constraints

**Branch and commit:**
- Branch `20260930.ui_refresh_3a_tokens`, PR #443. This plan adds one commit after it is committed.
- Do not amend or force-push.
- Commit subject, verbatim: `fix: allow em only on the label tracking (ui refresh step 3a)`.
- No "Generated with Claude Code" or co-author line.

**Code:**
- Code comments are one or two lines.
- The only test edits are the two in Step 1.
- Run every command from the repository root.

## Review Focus

1. **The real file.** `tokens.css` declares `--tracking-label: 0.12em` and no other `em`, so `tokens.gate.test.ts` passes unchanged.
2. **`rem`.** `allowedUnits` drops only `em`. A test name that says "em" must not hide a `rem` that no longer passes; the full suite in Step 4 shows it doesn't.

---

### Task 1: Pin `em` to `--tracking-label`

**Files:**
- Modify: `frontend/src/design/gate.ts`
- Test: `frontend/src/design/gate.test.ts`
- Modify: `docs/superpowers/specs/2026-10-07-ui-refresh-3a-tokens-design.md`
- Modify: `docs/design/ui-reference.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: the same exports, signatures and messages as `2a4ef77`.

- [ ] **Step 1: Edit the two tests**

In `gate.test.ts`, under `describe('what tokens.css may hold')`, replace:

```ts
  it('allows em, ms, no unit, vmin on the root and dvh on the shell', () => {
    const fine = '--a: 0.12em; --b: 180ms; --c: 1.5; --d: var(--text-2xl); --shell-height: 100dvh;'
```

with:

```ts
  it('allows ms, no unit, em on the label tracking, vmin on the root and dvh on the shell', () => {
    const fine = '--tracking-label: 0.12em; --b: 180ms; --c: 1.5; --d: var(--text-2xl); --shell-height: 100dvh;'
```

Then extend the `fails on %s` table with a last row. The previous row gains a trailing comma:

```ts
    ['--a: calc(1rem - -.5pt);', '--a: the unit pt in calc(1rem - -.5pt)'],
    ['--a: 0.12em;', '--a: the unit em in 0.12em']
```

- [ ] **Step 2: Run them on the current gate**

Run: `npx vitest run --root frontend src/design/gate.test.ts`

Expected: 1 failed, 61 passed (62). The failure is "fails on --a: 0.12em;".

- [ ] **Step 3: Move `em`**

In `gate.ts`, replace:

```ts
const allowedUnits = new Set(['', 'rem', 'em', 'ms', 'px'])
// J2: the viewport appears only in the root and the shell's height.
const unitOnlyOn: Record<string, string> = { vmin: '--root-size', dvh: '--shell-height' }
```

with:

```ts
const allowedUnits = new Set(['', 'rem', 'ms', 'px'])
// J2: the viewport appears only in the root and the shell's height, em only in the label tracking.
const unitOnlyOn: Record<string, string> = { em: '--tracking-label', vmin: '--root-size', dvh: '--shell-height' }
```

- [ ] **Step 4: Run the suite, typecheck and lint**

Run: `npm run test:unit && npm run typecheck && npm run lint`

Expected: 418 of 418 pass, which is the 417 at `2a4ef77` plus 1. Typecheck and lint print no errors.

- [ ] **Step 5: Prove both halves have teeth**

Apply each mutation to `gate.ts` alone, run `npx vitest run --root frontend src/design/gate.test.ts`, then restore the Step 3 version before the next mutation.

| Mutation | Expected |
|---|---|
| put `'em'` back in `allowedUnits` | 1 failed: "fails on --a: 0.12em;" |
| remove `em: '--tracking-label', ` from `unitOnlyOn` | 1 failed: "allows ms, no unit, em on the label tracking, ..." |

- [ ] **Step 6: Edit the spec and J2**

In `docs/superpowers/specs/2026-10-07-ui-refresh-3a-tokens-design.md`, replace:

```
- in `tokens.css`, a unit but `rem`, `em`, `ms` and `px`, except `vmin` on
  `--root-size` and `dvh` on `--shell-height` (J2);
```

with:

```
- in `tokens.css`, a unit but `rem`, `ms` and `px`, except `em` on
  `--tracking-label`, `vmin` on `--root-size` and `dvh` on `--shell-height`
  (J2);
```

In `docs/design/ui-reference.md`, under J2, replace:

```
- Every other size is in `rem`. No viewport unit appears outside the root but
  the app shell's height: exactly `100dvh` where principle 4's table says the
  page never scrolls, and at least `100dvh` in its other rows.
```

with:

```
- Every other size is in `rem`, but the label tracking, in `em` so that it
  follows its own text. No viewport unit appears outside the root but the app
  shell's height: exactly `100dvh` where principle 4's table says the page
  never scrolls, and at least `100dvh` in its other rows.
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/design/gate.ts frontend/src/design/gate.test.ts \
  docs/superpowers/specs/2026-10-07-ui-refresh-3a-tokens-design.md docs/design/ui-reference.md
git commit -m "fix: allow em only on the label tracking (ui refresh step 3a)" -m "J2 puts every size but the root in rem, yet the gate allowed em on every token, so a spacing in em would pass. The label tracking is the one em, since letter spacing follows its own text; the gate now names it, as it names the root's vmin and the shell's dvh."
```

Expected: one new commit, and a clean working tree.
