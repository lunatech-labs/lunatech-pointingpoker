# Deploy Button

Date: 2026-11-04
Status: Approved
Parent: issue #460, step 1

## Purpose

Deploying today means typing `git push origin main:production` from memory.
A button in the Actions tab replaces the command, so nobody has to remember it
and a typo cannot deploy the wrong thing. It also tells the person deploying,
without a terminal, what went out or why nothing did. It is also the "force it
now" path #460's later steps fall back on.

Out of scope: knowing whether rooms are in use (#460 step 2), watching Clever's
build result, rollback through the button.

## Terms

- **Target**: the commit `main` pointed to when the run was started, that is
  `github.sha` of a `workflow_dispatch` whose `github.ref` is
  `refs/heads/main`. Fixed for the whole run. A run started from any other ref
  has no target.
- **Green**: the target's latest `test` and `style-check` check runs, from
  GitHub Actions, both completed with `success`. `ci.yml` runs both jobs, with
  no path filter, on every push to `main`, so every target gets them.
- **Commit label**: a short hash followed by its subject line in parentheses,
  `fe922fb (build(deps): bump zod from 4.6.5 to 4.6.7 (#483))`. Every message
  that names a commit uses its label.

## The guard: a ruleset on `production`

A repository ruleset named `production`, applied to `refs/heads/production`:
restrict deletions, block force pushes, require `test` and `style-check` to
pass. Repository admins bypass it. It refuses, for anyone but an admin, a
deletion, a non-fast-forward, and a commit that is not green, whether the push
comes from the button or a terminal. Pointing it at `production` and adding
the admin bypass are done by the user before this step merges.

The button checks the same conditions first, so its refusal names the commit
and the reason instead of GitHub's `GH013` error. The ruleset stays the rule.

Accepted gap: someone with write access can still fast-forward `production` to
a green commit that is not on `main` (a pull request's head built on `main`,
green because `ci.yml` also runs on pull requests).
That takes a deliberate command, and the user does not treat it as the threat
to design for.

## Behaviour

One `workflow_dispatch` workflow, no inputs, runnable by anyone with write
access. Run name: `Deploy main by <actor>` (the run name is fixed before any
step runs and cannot carry a subject).

The first matching row applies.

| Situation at the run | Outcome | Message (job summary and error annotation) |
| --- | --- | --- |
| Started from a ref other than `main` | fails, nothing pushed | Start the deploy from `main`. |
| `production` already contains the target (equal or ahead) | succeeds, nothing pushed | Nothing to deploy: `production` is already at *label* (`production`'s own commit, so a commit not on `main` shows). |
| `production` is not an ancestor of the target | fails, nothing pushed | `production` (*label*) is not on `main`; an admin must reset it (README, Deployment). |
| Target not green | fails, nothing pushed | CI on *label* is not green: each check with its state (not started, in progress, or its conclusion). Deploy once both pass. |
| Otherwise | pushes the target to `production`, succeeds | Deployed *label* by *actor*, then one line per commit from `production`'s previous position to the target, each a label. |

A push refused anyway fails the run with git's refusal, after the target's
label. That covers the accepted races: `production` moved by an admin between
the check and the push, or a re-run of a check on the target turning red in
that window. A failure to read `production`, the target or its checks fails
the run before any push, with the error.

- **One at a time**: a concurrency group on the workflow, without
  cancel-in-progress. A run started while another is in progress waits; a
  newer start replaces a run that is still waiting, which GitHub marks as
  cancelled.
- **Permissions**: `contents: write`, nothing else.

## README

The "Deployment" section gains a short part: what triggers a deploy (a push to
`production`, which Clever deploys from), how to deploy (the button), what the
ruleset refuses, and how to roll back (Clever's console redeploys a previous
build; `production` only needs an admin reset, a force push to a commit on
`main`, if it holds a commit that is not on `main`).

## Verification

- The ruleset was tried on a stand-in branch on 2026-11-04, with no bypass: an
  unchecked commit, a commit with checks in progress, a force push and a
  deletion were refused; a green commit was accepted. A failed check was not
  tried; it falls under the same "must have passed" rule.
- Before merging: the workflow cannot be dispatched until it is on `main`, so
  its decision logic is exercised against a stand-in branch in place of
  `production`, covering each row of the table. The plan says how.
- First real run, after merging: confirm with `clever activity` that a push
  made with the workflow's token starts a Clever deploy. If it does not, the
  token needs replacing, and that goes back to this spec.
- The pull request edits `.github/workflows`, so the user merges it in the
  GitHub UI.

## Decisions

1. No inputs. A commit field would reintroduce the typo the button removes.
   This departs from #460, which offered "or a chosen commit on it".
2. Refuse when CI is not green rather than wait for it. Waiting adds polling;
   clicking again later costs a minute.
3. Rollback stays outside the button: Clever's console for the build, an admin
   for the branch. A rollback input would need force-push rights the button
   should not have. This narrows #460's "a deliberate force-push to an earlier
   commit" to admins, through the ruleset's bypass.
4. The ruleset, not a credential only the button holds, guards `production`.
   Locking updates to the button would need a GitHub App or deploy key kept
   as an environment secret; the gap it closes is the accepted one above.
5. No GitHub deployment record (`environment:`): it would record the push,
   not Clever's build, and the Actions tab already lists every deploy run.
