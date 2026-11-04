# UI Refresh Step 3a: Keep the Regex Gate's Declaration Checks

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the two declaration checks that the PostCSS refactor (`9847e93`) dropped.

**Architecture:**
- The regex gate matched each declaration against `^(--[a-z0-9-]+)\s*:\s*([^:]+)$`.
- The PostCSS `block()` only checks that the name starts with `--`. Since CSS allows any `<dashed-ident>` and an empty value, PostCSS accepts both.
- `block()` gets both checks back: the name must match `--[a-z0-9-]+`, and the value must not be empty. The message is unchanged.

**Tech Stack:** TypeScript ~5.9 (strict), Vitest 5, `postcss` 8.

**Spec:** `docs/superpowers/specs/2026-10-07-ui-refresh-3a-tokens-design.md`, section "Parsing". It never listed these two checks, so this plan adds them to its list of what fails.

**Origin:**
- The final review of `9847e93` found the loosening. Its cases were re-run against `da0679e` and `9847e93`: `--a: ;`, `--a: /*c*/;`, `--A`, `--a_b` and a bare `--` threw before the refactor and passed after it.
- Stylelint can enforce both checks with `custom-property-pattern` and `declaration-property-value-allowed-list` (probed with 17.16.0). Step 4 can move them there.
- Every code block below was run in the throwaway worktree on `9847e93`.

## Global Constraints

**Branch and commit:**
- Branch `20260930.ui_refresh_3a_tokens`, PR #443. This plan adds one commit after it is committed.
- Do not amend or force-push.
- Commit subject, verbatim: `fix: keep the declaration checks the regex gate made (ui refresh step 3a)`.
- No "Generated with Claude Code" or co-author line.

**Code:**
- Code comments are one or two lines.
- The only test edit is the table in Step 1.
- Run every command from the repository root.

## Review Focus

1. **colours.css.** `block()` serves both files, so `--A: #000` in `colours.css` now fails too, as it did before the refactor. An empty value there already failed in `parseColour`.
2. **The current files.** Every token in `colours.css` and `tokens.css` already has a lower-case name and a value, so `tokens.gate.test.ts` passes unchanged.

---

### Task 1: Restore the name and empty-value checks

**Files:**
- Modify: `frontend/src/design/gate.ts`
- Test: `frontend/src/design/gate.test.ts`
- Modify: `docs/superpowers/specs/2026-10-07-ui-refresh-3a-tokens-design.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: the same exports, signatures and messages as `9847e93`.

- [ ] **Step 1: Add the failing cases**

In `gate.test.ts`, under `describe('what tokens.css may hold')`, put this before `it('reads a last declaration with no semicolon', ...)`:

```ts
  it.each(['--a: ;', '--a: /* none */;', '--A: 1rem;', '--a_b: 1rem;', '--: 1rem;'])('fails on %j', declaration => {
    expect(() => parseTokens(file(declaration))).toThrow('not a custom property in :root')
  })
```

- [ ] **Step 2: Run them on the current gate**

Run: `npx vitest run --root frontend src/design/gate.test.ts`

Expected: 5 failed, 56 passed (61). All five new cases fail.

- [ ] **Step 3: Restore the checks**

In `gate.ts`, in `block()`, replace:

```ts
    // A value holds no colon, so a missing semicolon cannot merge two declarations.
    if (node.type !== 'decl' || !node.prop.startsWith('--') || node.value.includes(':') || node.important) {
```

with:

```ts
    const custom = node.type === 'decl' && /^--[a-z0-9-]+$/.test(node.prop) && node.value.trim() !== ''
    // A value holds no colon, so a missing semicolon cannot merge two declarations.
    if (!custom || node.value.includes(':') || node.important) {
```

- [ ] **Step 4: Run the suite, typecheck and lint**

Run: `npm run test:unit && npm run typecheck && npm run lint`

Expected: 417 of 417 pass, which is the 412 at `9847e93` plus 5. Typecheck and lint print no errors.

- [ ] **Step 5: Prove each check has teeth**

Apply each mutation to `gate.ts` alone, run `npx vitest run --root frontend src/design/gate.test.ts`, then restore the Step 3 version before the next mutation.

| Mutation | Expected |
|---|---|
| `/^--[a-z0-9-]+$/.test(node.prop)` becomes `node.prop.startsWith('--')` | 3 failed: `--A`, `--a_b`, `--` |
| remove ` && node.value.trim() !== ''` | 2 failed: the two empty values |

- [ ] **Step 6: Edit the spec's Parsing section**

In `docs/superpowers/specs/2026-10-07-ui-refresh-3a-tokens-design.md`, replace:

```
- any other rule in either file, a token declared twice in one block or with
  `!important`, or a colour token declared in `tokens.css`;
```

with:

```
- any other rule in either file; in a block, a name outside `--[a-z0-9-]+`,
  an empty value, `!important` or a token declared twice; or a colour token
  declared in `tokens.css`;
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/design/gate.ts frontend/src/design/gate.test.ts \
  docs/superpowers/specs/2026-10-07-ui-refresh-3a-tokens-design.md
git commit -m "fix: keep the declaration checks the regex gate made (ui refresh step 3a)" -m "The PostCSS refactor checked only that a name starts with --, so tokens.css accepted an empty value and names such as --A or --a_b, which the regex gate rejected. A token name is again lower-case letters, digits and hyphens, and its value is not empty."
```

Expected: one new commit, and a clean working tree.
