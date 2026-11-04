# Deploy Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `workflow_dispatch` button that fast-forwards `production` to `main` and says, without a terminal, what went out or why nothing did.

**Architecture:** The decision table lives in one bash script, run by a thin workflow. The script reads git ancestry and the target's check runs, then writes the job summary, an error annotation and, on the last row, a plain `git push`. A scenario test drives the script against a throwaway local origin with a stubbed `gh`.

**Tech Stack:** bash, git, `gh api`, jq, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-04-deploy-button-design.md`

## Global Constraints

- No workflow inputs. Run name exactly `Deploy main by ${{ github.actor }}`.
- Workflow `permissions:` is `contents: write` only. Concurrency group `deploy-production`, `cancel-in-progress: false`.
- Commit label: `git log -1 --format='%h (%s)' <sha>`. Every message naming a commit uses it.
- Green: the latest `test` and `style-check` check runs from GitHub Actions (app id 15368) both `completed` with `success`.
- Messages, with `<branch>` the deploy branch (`production` in the real workflow):
  - `Start the deploy from main.`
  - `Nothing to deploy: <branch> is already at <label>.` (label of the branch's own commit)
  - `<branch> (<label>) is not on main; an admin must reset it (README, Deployment).`
  - `CI on <label> is not green: test <state>, style-check <state>. Deploy once both pass.`, a state being `not started`, `in progress` or the conclusion (`failure`, `cancelled`, …)
  - `Deployed <label> by <actor>.`, then one `- <label>` line per commit in `<previous>..<target>`, git's default order (newest first)
  - `Push of <label> to <branch> refused:`, then git's output in a fenced block
  - when that output has a line containing both `refusing to allow` and `workflow`, instead: `GitHub does not let this button push changes to workflow files, and <label> includes some. Deploy it from a terminal instead:`, then `git push origin <target full hash>:<branch>` in a fenced block
  - `Could not read <what>:`, then the error in a fenced block (`<what>` is `<branch>`, `the target` or `its checks`)
- Every message goes to `$GITHUB_STEP_SUMMARY`; a failing row also prints `::error::<message>` with `%`, CR and LF escaped as `%25`, `%0D`, `%0A`.
- Exit 0 on the two success rows, 1 on every other outcome. Never a force push.

## Rulings

Choices the spec left open, each with the simpler alternative it beat.

1. The logic is a script with a stubbed scenario test, not an inline `run:` block. Inline is simpler, but its rows could only be reached on GitHub by moving protected branches by hand.
2. The scenario test runs in CI's `style-check` job. Running it only locally is simpler, and it would rot.
3. A trial with the real token before merging (Task 3). Waiting for the first real run is simpler, but a bug would then surface as a production push or a second pull request merged in the UI.
4. A check absent or `queued`, `waiting`, `requested`, `pending` reads `not started`; the commit list keeps git's order, newest first.
5. The ruleset moves to `production` after the trial, so the trial runs against it with the token. Moving it first is simpler and leaves the trial unguarded.

## Review Focus

1. A subject holding `%`, backticks, quotes or `$(…)` must appear literally in the summary and annotation, never expanded or truncated. Test in Task 1.
2. A multi-line git refusal must stay one annotation (escaped newlines) and appear whole in the summary. Test in Task 1.
3. A target git does not know must fail as `Could not read the target`, not as "not on main": the script checks `git cat-file -e "$TARGET^{commit}"` before any ancestry test. Test in Task 1.
4. A `production` several commits behind lists every commit, none dropped. Test in Task 1.
5. A re-run that superseded a failed check, or a same-named check from another app, must not decide the outcome. The query pins `app_id=15368` and relies on the API's default `filter=latest`; the stub cannot prove it, so the Task 3 trial and the reviewer read the query.

---

### Task 1: The decision script and its scenario test

**Files:**
- Create: `.github/scripts/deploy-production.sh` (executable)
- Create: `.github/scripts/deploy-production.test.sh` (executable)

**Interfaces:**
- Produces: `deploy-production.sh`, run from the root of a clone whose remote is `origin`, with full history. Environment:
  - `SOURCE_REF`: the ref the run started from (`github.ref`)
  - `TARGET`: the commit to deploy (`github.sha`)
  - `ACTOR`, `REPO` (`owner/name`), `GH_TOKEN`
  - `DEPLOY_BRANCH`: defaults to `production`; the trial sets `ruleset-trial`
  - `GITHUB_STEP_SUMMARY`: the file to append to
- Checks are read with `gh api "repos/$REPO/commits/$TARGET/check-runs?app_id=15368&per_page=100"`, parsed with jq; a check name absent from the answer, or with status `queued`, `waiting`, `requested` or `pending`, is `not started`.
- Rows are evaluated in the spec's order, after `git fetch origin "+refs/heads/$DEPLOY_BRANCH:refs/remotes/origin/$DEPLOY_BRANCH"`. The fetch, the target lookup and the `gh api` call each fail as `Could not read …`.

- [ ] **Step 1: Write the scenario test**

Plain bash, no framework. Each case builds a fresh temp dir: a bare `origin` with commits `A ← B ← C` on `main` and the deploy branch at `A`, a clone of it as the working dir, and a `bin/gh` stub first on `PATH` that prints `$FAKE_CHECKS` (or writes to stderr and exits 1 when `FAKE_GH_FAIL=1`). Set `GIT_AUTHOR_*`/`GIT_COMMITTER_*` so CI needs no git identity. Print `ok - <name>` or `not ok - <name>: <why>`, exit non-zero if any case failed. `GREEN` is a check-runs JSON with both checks `completed`/`success`.

| Case | Setup | Expect: exit, summary contains, deploy branch on origin |
| --- | --- | --- |
| `refuses_other_ref` | `SOURCE_REF=refs/heads/feature`, target C, GREEN | 1; `Start the deploy from main.`; A |
| `nothing_when_equal` | branch at C, target C | 0; `Nothing to deploy: production is already at` + label(C); C |
| `nothing_when_ahead` | branch at C, target B | 0; label(C), not label(B); C |
| `refuses_diverged` | branch at X, a commit on A not on main; target C | 1; `production (`+label(X)+`) is not on main`; X |
| `not_green_lists_states` | target C; `test` in_progress, `style-check` completed/failure | 1; `test in progress, style-check failure`; A |
| `not_green_missing_check` | target C; only `style-check` success | 1; `test not started`; A |
| `deploys_and_lists` | target C, GREEN | 0; `Deployed `+label(C)+` by tester.`, `- `+label(C), `- `+label(B); C |
| `push_refused` | target C, GREEN; `pre-receive` hook on origin printing two lines and exiting 1 | 1; `Push of `+label(C)+` to production refused:` and both hook lines; stdout has one `::error::` line containing `%0A`; A |
| `push_refused_workflow` | target C, GREEN; hook prints `refusing to allow a GitHub App to create or update workflow `.github/workflows/ci.yml` without `workflows` permission` and exits 1 | 1; `does not let this button push changes to workflow files`, `git push origin `+full(C)+`:production`; A |
| `branch_unreadable` | deploy branch deleted from origin | 1; `Could not read production:`; nothing pushed |
| `checks_unreadable` | target C, `FAKE_GH_FAIL=1` | 1; `Could not read its checks:`; A |
| `unknown_target` | target `deadbeef…` (40 hex, absent) | 1; `Could not read the target:`; A |
| `literal_subject` | C's subject ``fix: 100% `tick` "q" $(touch pwned)``, GREEN | 0; the subject verbatim in the summary; no file `pwned` exists |
| `literal_subject_in_error` | as `refuses_diverged`, X's subject ``fix: 100% `tick` ``| 1; the `::error::` line contains `100%25`; the summary has `100%` |

- [ ] **Step 2: Run it, expect every case to fail**

Run: `bash .github/scripts/deploy-production.test.sh`
Expected: `not ok` for every case (script missing), non-zero exit.

- [ ] **Step 3: Write `deploy-production.sh`**

`set -euo pipefail`. Helpers: `label <sha>`, `say <text>` (append to summary), `fail <text>` (say, print the escaped `::error::`, exit 1). Messages exactly as in Global Constraints. Push with `if ! out=$(git push origin "$TARGET:refs/heads/$DEPLOY_BRANCH" 2>&1)`, so `set -e` does not end the run before the refusal message; git prefixes hook lines with `remote:`, so tests match substrings.

- [ ] **Step 4: Run the test, expect every case to pass**

Run: `bash .github/scripts/deploy-production.test.sh`
Expected: `ok` for every case, exit 0.

- [ ] **Step 5: Prove the tests can fail**

Break each of these in turn and see the named case go `not ok`, then restore: drop the `cat-file` lookup (`unknown_target`), skip the `%0A` escaping (`push_refused`), swap the "equal or ahead" check for "equal" (`nothing_when_ahead`).

- [ ] **Step 6: Commit**

```bash
git add .github/scripts/deploy-production.sh .github/scripts/deploy-production.test.sh
git commit -m "feat: the deploy script and its scenario test (#460 step 1)"
```

### Task 2: The workflow, CI and README

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/ci.yml`, job `style-check`, a last step
- Modify: `README.md`, section `### Deployment`

**Interfaces:**
- Consumes: `deploy-production.sh` and its environment (Task 1).

- [ ] **Step 1: Write `deploy.yml`**

`name: Deploy`, the run name, `on: workflow_dispatch`, the permissions and concurrency from Global Constraints. One job `deploy` on `ubuntu-latest`: `actions/checkout@v7` with `fetch-depth: 0` (the version `ci.yml` uses), then run the script with `SOURCE_REF: ${{ github.ref }}`, `TARGET: ${{ github.sha }}`, `ACTOR: ${{ github.actor }}`, `REPO: ${{ github.repository }}`, `GH_TOKEN: ${{ github.token }}`.

- [ ] **Step 2: Run the scenario test in CI**

Append to `style-check` a step `deploy script tests` running `bash .github/scripts/deploy-production.test.sh`. It is the short job, and both its checks already gate `main`.

- [ ] **Step 3: README**

Under `### Deployment`, before the SSE paragraph, a short part with a bold lead sentence in the section's style: a push to `production` deploys (Clever deploys from that branch, not `main`); deploy with Actions → Deploy → Run workflow on `main`; the `production` ruleset refuses deletion, force pushes and commits whose `test` and `style-check` have not passed, admins excepted; to roll back, redeploy a previous build in Clever's console, and only if `production` holds a commit not on `main` does an admin force-push it back to a commit on `main`.

- [ ] **Step 4: Verify**

Run: `bash .github/scripts/deploy-production.test.sh && ruby -ryaml -e 'YAML.load_file(".github/workflows/deploy.yml"); YAML.load_file(".github/workflows/ci.yml")' && echo yaml-ok`
Expected: every case `ok`, then `yaml-ok`. (If `ruby` is absent, `python3 -c 'import yaml…'` or `npx --yes js-yaml` does the same.)

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yml .github/workflows/ci.yml README.md
git commit -m "feat: the Deploy button workflow and its README part (#460 step 1)"
```

### Task 3: Trial with the workflow's own token

Done by the controller, not a subagent; every push needs the user's approval. It proves what the stub cannot: that a push with `GITHUB_TOKEN` passes the ruleset when green, that `contents: write` alone may read check runs, whether GitHub refuses a range that changes workflow files, and the real summary.

- [ ] **Step 1: Open the pull request as a draft** (body says "Part of #460"), so the branch's newest commit gets `test` and `style-check`; wait until both pass.
- [ ] **Step 2: Push a throwaway branch `deploy-trial`**: this branch plus one commit changing `deploy.yml` to `on: push: branches: [deploy-trial]`, `DEPLOY_BRANCH: ruleset-trial`, `SOURCE_REF: refs/heads/main`, and `TARGET` set by a prior step from `git rev-parse origin/20261104.deploy_1_button`. The range from `ruleset-trial`'s current position to that target changes `.github/workflows`, and its workflow files match a branch tip, as on the first real deploy. Never merged.
- [ ] **Step 3: Read the run**, then delete `deploy-trial`:
  - success with `Deployed <label> by <actor>.` and the range's commits: keep the token, go on;
  - the workflow-files message: the detection works, and the token question goes back to the user and the spec (decision 5);
  - `Could not read its checks`: adding `checks: read` changes the spec's permissions line, so it goes back to the user.

### After the tasks (the user's steps, in order)

1. Ruleset: point it at `production` only and add the repository-admin bypass; then delete `ruleset-trial`.
2. Mark the pull request ready; the user merges it in the GitHub UI.
3. First real run, when no room is in use: the user clicks Deploy; the controller watches `clever activity` for the deploy the push should start.
4. Comment on #460: step 1 shipped, and the spec's departures (decisions 1 and 3).
