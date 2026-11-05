# Backlog to GitHub Issues

Date: 2026-11-04
Status: Approved
Parent: issue #423

## Purpose

Open work today lives in `docs/known-issues.md`, the unticked items of
`docs/roadmap.md`, and the later-step candidates of a few specs. Recording a
new item means a PR: a standalone one, or an unrelated feature's. Moving open
work to GitHub issues lets an item be recorded the moment it is found, and the
repo's Issues tab gives a daily glance at how much is left.

The modernization effort that `roadmap.md` tracked has been delivered. The app
is moving to low maintenance with small features, so no milestone, Project
board or forward-looking roadmap replaces it.

## Readers

Only the maintainer and Claude read the backlog. Colleagues learn of changes
from the app and from deployment announcements in the internal chat; none read
the repo. The backlog's two jobs are therefore: the maintainer's glance at the
Issues tab, and an entry point Claude reads without being pointed at it.

## Terms

- **Source item**: one of
  - a `###` entry of `known-issues.md`;
  - an unticked (`- [ ]`) item of `roadmap.md`, its "Backlog" section included;
  - a spec candidate: in the 2026-09-30 UI refresh spec, its "Steps after 5"
    list, Appendix A's "Improve" and "Remove or avoid" lists, and the steps
    table's undelivered steps that no known-issues entry covers (a step is
    delivered when a `main` commit subject ends "(ui refresh step <id>)");
    elsewhere, any list a grep for "step 5+", "steps 5 and after" or "steps
    after 5" finds in a spec, a safety net that finds none today.
    `docs/design/ui-reference.md` mirrors the UI refresh lists; its one extra
    candidate is dropped by its own item M.
- **Bucket**: the verdict on a source item, one of the five in decision 2.
- **Index**: the table that replaces `known-issues.md`'s entries (decision 5).

## Decisions

### 1. All open work lives in issues

This includes findings a PR surfaces, not only unrelated ones; the PR links
the issue, and "Closes #N" closes it on merge. One rule instead of two, so no
judgement call on which home a finding gets.

Decisions are not open work. A spec's "Accepted costs", the 2026-08-31 target
design's "Deferred, with triggers" rows, and `roadmap.md`'s "Considered and set
aside" list stay where they are; one that later becomes worth doing gets an
issue then.

### 2. Buckets

| Bucket | Test | Becomes |
| --- | --- | --- |
| Open | Still true and worth doing | An open issue, labelled |
| Fixed | No longer true in the code, checked in the code, not the docs | No issue; the fixing PR is traced on a best-effort basis |
| Accepted | Still true, deliberately lived with | An issue closed as not planned with a one-line why, so its reasoning stays searchable |
| Obsolete | No longer matters, true or not | No issue; the text stays in git history |
| Lesson | A way of working, not a work item | A rule in the repo's `CLAUDE.md` if it is about the codebase, else a memory note |

A sort may return "unsure" for an item; the maintainer decides it. Where each
verdict is recorded depends on the item's source: decision 5.

The sort checks every source item against all open issues. An item an open
issue already covers links to it rather than opening a duplicate; #460, for
instance, covers part of the roadmap, per the 2026-10-22 comment on #423.

Several Open items may become one issue. Known candidates:

- **Screen reader**: one umbrella issue labelled `a11y`, per the 2026-10-03
  comment on #423. The comment's list of entries is stale; the sort picks the
  members. Done when each works in Orca with Firefox and one other screen
  reader.
- **Phone checks**: the entries saying phone behaviour is unverified or
  unchecked, as one umbrella issue, if the sort agrees they share a done-when.

### 3. Labels

The vocabulary: one type label per issue, `bug`, `enhancement`, `documentation`
(all three exist) or `debt` (refactors, test and CI gaps); optional area labels
`a11y`, `security`, `ux`; and `request` for something a user asked for, whose
body names who asked and how, so they can be told when it ships. No priority
labels.

A label is created when an issue first uses it; the migration's dry run shows
which ones that is. The open issues that predate the migration get their labels
in the same run.

### 4. Issue body

The source item's text, followed by a line naming its source: a permalink to
the file on a `main` commit, plus the spec section for a spec candidate. A
`main` commit permalink does not dangle, unlike a branch hash.

### 5. Where verdicts are recorded

- **`known-issues.md`** keeps a short header, then the index: one table of the
  entry's title verbatim, its bucket, its destination, with exactly one row per
  entry. Destinations read "→ #N", "fixed in #PR", "fixed", "dropped" or
  "lesson". The header says open work lives in GitHub issues, and that the
  index records the move and is never updated afterwards; each `#N` shows its
  live state on GitHub. Files cite these docs by quoted title, paraphrase,
  line range or phase, never by heading anchor; a quoted title greps to its
  row, and the rest resolve through git history.
- **`roadmap.md`** is frozen in place. A header says the modernization is
  delivered and open work lives in GitHub issues. Each unticked item gets an
  inline marker, from the same list as the index's destinations. Nothing is
  deleted, so phase, ticked and paraphrased citations still resolve.
- **Spec candidates** get no record beyond their issue. Open ones link back to
  their spec section; a Fixed or Obsolete one leaves no trace, which costs at
  most a re-proposal the maintainer declines.

Delivered specs and plans are not edited. The live files that point at the
backlog change:

- The README names the provider once: its "Roadmap and known issues" section
  becomes one line saying open work is tracked in the repository's issues,
  linking the Issues tab. The sentence saying `docs/roadmap.md` schedules the
  legacy-link removal is removed, and "the room-creation hardening listed
  under Phase 5 in `docs/roadmap.md`" loses its pointer and gains no status
  word, so the sort's bucket cannot contradict it. A provider move then
  touches one README line.
- The comments on `PageRoutes` and `LegacySlug` that cite `docs/roadmap.md`
  name the legacy-link removal's issue instead.

### 6. Filing rule from now on

Claude shows every issue in chat before creating it (a one-liner for one just
discussed, a drafted title and body otherwise) and waits for an OK. For this
migration, the maintainer confirms the sorted list once, not each issue.

### 7. Claude's entry point

A new repo `CLAUDE.md` says open work lives in GitHub issues, to list them when
asked what is next, and to search open and closed issues before drafting a new
one. Being committed, it holds on any machine. It starts with those lines and
the codebase Lessons only; a later effort moves the other project rules there
from memory.

The memory notes that name `known-issues.md` or `roadmap.md` as where a finding
goes are updated, before any issue is created (order of work, step 3): among
them "findings go in docs, not PR bodies", which now points to issues, and the
phone hand-test note. "Fold docs into the code PR" stays, for specs and docs
only. Notes that merely cite an entry stay as they are. Memory lives outside
the repo, so these edits are not part of the PR.

## Order of work

1. A subagent's first pass of decision 2's sort; Claude verifies it before
   showing it.
2. The maintainer confirms the sorted list: per item its bucket, and for each
   issue its title, labels and which items it merges. Spec candidates are
   shown grouped by their list, so a missed bullet is visible.
3. The memory notes switch to issues (decision 7), the Lessons not about the
   codebase become memory notes unless one already covers them, and
   `known-issues.md` and `roadmap.md` are not edited until step 5's PR.
4. A script creates the labels in use, then the issues, after a dry run that
   lists them and fails on a repeated title. GitHub is its record: each run
   first lists every issue, open and closed, skips any title that exists, and
   closes any Accepted issue it finds open. A rerun after a partial failure
   therefore neither duplicates nor leaves an Accepted issue open. Its output,
   each source item's destination, generates the index rows and roadmap
   markers; none are typed by hand.
5. One PR applies decision 5 to both files, the README and the two code
   comments, adds the repo `CLAUDE.md`, and closes #423. It checks its result
   against `main` before the PR: one index row per `###` entry of
   `known-issues.md`, one marker per unticked item of `roadmap.md`.

Issues exist before the PR, since the index needs their numbers. If the PR
stalls, the unedited files and the issues briefly duplicate each other.

## Out of scope

- Closed GitHub issues from 2020-2021.
- Colleagues filing issues themselves; requests reach the maintainer by chat.
- A lighter process for small features, now that the modernization is done.
- Slimming the README beyond its backlog section: #493.

## Left to the builder

- Issue titles (normally the entry's title), body trimming of plainly stale
  citations, label colours.

## Calls made without the maintainer (check these)

- The confirmed list covers buckets, titles, labels and merges, not bodies.
- Issues are created by script with a dry run, not by hand.
- The colleague's recent request (lower / median / mean in the result) joins
  the issue for the matching result-display or tie candidate, labelled
  `request`, if the sort finds one; otherwise it gets its own.
