# Backlog to GitHub Issues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every open item of `docs/known-issues.md`, `docs/roadmap.md` and the named spec candidates becomes a GitHub issue or a recorded verdict, and the repo points at issues from then on.

**Architecture:** A sort produces one manifest (items, verdicts, issues to file). A run-once Python script turns the manifest into labels and issues, idempotent against GitHub's issue list, and writes each item's destination. A generator turns those destinations into the `known-issues.md` index and the `roadmap.md` markers, checked against `main`. Hand edits cover the README, two code comments and a new repo `CLAUDE.md`.

**Tech Stack:** Python 3 stdlib (`json`, `subprocess`, `unittest`), `gh`, git, Markdown.

**Spec:** `docs/superpowers/specs/2026-11-04-backlog-to-issues-design.md`

## Global Constraints

- Buckets: Open, Fixed, Accepted, Obsolete, Lesson (spec decision 2).
- Destinations, exactly: `→ #N`, `fixed in #PR`, `fixed`, `dropped`, `lesson` (decision 5).
- Labels: one type label of `bug`, `enhancement`, `documentation`, `debt`; optional `a11y`, `security`, `ux`, `request`. No priority labels (decision 3).
- Issue body: the item's text, then a source line with a permalink on a `main` commit, plus the spec section for a spec candidate (decision 4).
- Accepted issues are closed as not planned with a one-line why (decision 2).
- Delivered specs and plans are not edited. Citations name titles, never heading anchors.
- Conventional Commits, no tool attribution, no counts of items or commits in docs or the PR body.

## Rulings on what the spec left open

- **Where the migration tooling lives:** `.claude/backlog-migration/`, ignored through `.git/info/exclude`, never committed. It runs once and GitHub is its record. Simpler alternative, the session scratchpad, is lost on `/clear` mid-effort.
- **Script language:** Python stdlib with `unittest`, no dependency. Bash with jq was the simpler-looking alternative, but the rerun planning is pure logic that wants scenario tests.
- **Manifest is the single interface** between the sort, the script and the generator (schema in Task 1). Issue bodies are written into it after step 2's confirmation; the script only appends source lines.
- **Lesson wording:** the sort drafts each Lesson's one-line rule, and step 2 shows it, since the codebase ones are committed text.
- **Roadmap marker:** `*(→ #N)* ` inserted right after `- [ ] `; the checkbox stays unticked. Simpler alternative, ticking the box, would claim the item done.
- **known-issues.md** loses its "Traceability note" with the entries; only the header and the index remain, as decision 5 says.
- **README heading** "Roadmap and known issues" becomes "Open work". Nothing links its anchor (checked by grep).
- **Against a moving `main`:** Task 5 rebases onto a fresh `origin/main` before generating, so an entry merged after the sort is in the file and fails `index_table`, and the PR does not conflict. Simpler than reading `origin/main` and rebasing anyway.

## Review Focus

- A rerun after a partial failure (some issues created, an Accepted one left open) creates nothing twice and closes the open Accepted one. Task 4 tests it.
- A title containing `|` must not break the index table. Task 4 tests the escaping.
- A roadmap reference matching zero or two lines (an item ticked or duplicated on main after the sort) must fail generation, not mark the wrong item. Task 4 tests it.
- A manifest item whose reference does not match `main` (a typo in a title) fails generation instead of dropping a row: `index_table` and `mark_roadmap` raise in Task 5 Step 1, and Task 4 tests both.
- A `known-issues.md` entry merged to `main` after the sort fails Task 5's generation and is sorted before the PR.

---

### Task 1: Sort the source items into the manifest

**Files:**
- Create: `.claude/backlog-migration/manifest.json` (ignored)
- Modify: `.git/info/exclude` (append `**/.claude/backlog-migration/` if `git check-ignore` says it is not ignored)

**Interfaces:**
- Produces: `manifest.json`, read by Tasks 2, 4 and 5:

```json
{
  "mainSha": "<40-hex sha of origin/main at sort time>",
  "repo": "lunatech-labs/lunatech-pointingpoker",
  "issues": [
    {"key": "screen-reader", "title": "...", "labels": ["enhancement", "a11y"],
     "accepted": null, "body": null}
  ],
  "existingIssueLabels": {"472": ["debt"]},
  "items": [
    {"source": "known-issues", "ref": "<### title verbatim>", "lines": [15, 35],
     "bucket": "issue", "issue": "screen-reader", "fixedIn": null, "lesson": null, "why": "..."},
    {"source": "spec", "ref": "...", "path": "docs/superpowers/specs/2026-09-30-ui-refresh-design.md",
     "section": "Steps after 5", "lines": [472, 480], "bucket": "lesson", "issue": null, "fixedIn": null,
     "lesson": {"rule": "...", "scope": "codebase"}, "why": "..."}
  ]
}
```

`source` is `known-issues`, `roadmap` or `spec`. `ref` is the `###` title verbatim, the roadmap bullet's first line after `- [ ] ` verbatim, or, for a spec item, the bullet's first words; a spec item also has `path` and `section`. `bucket` is `issue`, `fixed`, `obsolete` or `lesson`; an `issue` item is Open or Accepted as its issue is, so one issue cannot mix them. `issue` is an issue key, an existing issue number (an int, for an item an open issue covers; Open), or null. `accepted` holds the one-line why for an Accepted issue. `lesson` holds the drafted rule and its scope. `existingIssueLabels` keys are issue numbers as JSON strings; the script converts them to int. `why` is the sort's reason, shown in step 2. `body` stays null until Step 4.

- [ ] **Step 1: Dispatch the first pass** to one fresh general-purpose subagent (Opus). Give it spec sections Terms and decision 2, the open issues list (`gh issue list --state open`), the #423 comments, and the schema above. Ask for every `###` entry of `docs/known-issues.md`, every `- [ ]` item of `docs/roadmap.md`, and the spec candidates the Terms name. Delivered UI refresh steps come from `git log origin/main --format=%s | grep "(ui refresh step "`. Ask it to mark "unsure" where it cannot decide, and to check each Fixed verdict in the code, citing the file and symbol.
- [ ] **Step 2: Verify the pass.** Counts per source must match `main`: `grep -c '^### '` on known-issues, `grep -c -- '- \[ \]'` on roadmap, and each spec list's bullets. Check each Fixed verdict's citation in the code, and each issue it says covers an item. Expected: no item missing, no Fixed verdict resting on docs alone.

### Task 2: The maintainer confirms the sorted list

- [ ] **Step 1: Show the list in chat,** grouped by source, spec candidates grouped by their list. Per item: ref, bucket (Open or Accepted derived from its issue), why, destination issue. Per issue: title, labels, merged items. Per Lesson: its rule and where it goes. Per pre-existing open issue: its current and new label set. Ask for the requesting colleague's name and channel for the `request` issue.
- [ ] **Step 2: Apply the rulings** to `manifest.json` and resolve every "unsure". Expected: the user's OK on the whole list.
- [ ] **Step 3: Write each issue's `body`** from its items' text, trimming plainly stale citations. An umbrella body opens with its done-when, then one `###` part per member. A `request` body names who asked and how; a request with no matching item gets its own issue, its body written by hand.

### Task 3: Switch memory to issues (no repo change)

- [ ] **Step 1:** `grep -ln 'known-issues\|roadmap'` in the memory directory. Edit each note that says a finding goes to either file so it says an issue. `feedback_durable_findings_not_pr_body.md` and `project_phone_hand_test_availability.md` are among them. Notes that only cite an entry stay as they are. "Fold docs into the code PR" stays.
- [ ] **Step 2:** Each personal Lesson becomes a memory note, unless one already covers it, with its `MEMORY.md` line.
- [ ] **Step 3:** Show the user the edited and new notes as a list of names and one-line changes.

### Task 4: The migration script

**Files:**
- Create: `.claude/backlog-migration/migrate.py`, `.claude/backlog-migration/test_migrate.py` (ignored)

**Interfaces:**
- Consumes: `manifest.json` (Task 1).
- Produces: `.claude/backlog-migration/result.json`, `{"known-issues": {"<ref>": "<destination>"}, "roadmap": {...}, "spec": {...}}`, every item under its source; and these functions, used by Task 5:
  - `validate(manifest: dict) -> None`: raises `ValueError` on a repeated issue title, a repeated (source, ref), an issue without a `body`, an item naming an unknown issue key, an `issue` item without an issue, a non-`issue` item with one, or an issue with no item unless it carries `request` and a hand-written body.
  - `plan(manifest: dict, issues: list[dict], labels: set[str]) -> list[tuple]`: `issues` as `gh issue list --state all --json number,title,state,labels` returns them, labels as `[{"name": …}]` objects; raises `ValueError` if an `existingIssueLabels` number or an item's int `issue` is not in `issues`. Actions, in this order: `("label", name)` for each label used by a manifest issue or `existingIssueLabels` and not in `labels`; `("create", key)` for each manifest issue whose title is not in `issues`; `("close", key)` for each Accepted issue just created or found `OPEN` by title, `run` taking its number and its `accepted` why for the comment; `("edit-labels", number, add, remove)` for each `existingIssueLabels` entry whose labels differ from the issue's; the entry is the complete set, so `remove` is every label outside it; `add` and `remove` are sorted.
  - `buckets(manifest: dict) -> dict[str, dict[str, str]]`: per source, then per item ref, `Open`, `Accepted` (an `issue` item, from its issue's `accepted`), `Fixed`, `Obsolete` or `Lesson`.
  - `destinations(manifest: dict, issues: list[dict]) -> dict[str, dict[str, str]]`: per source, then per item, by bucket: `issue` to `→ #N` (by title, or the int); fixed to `fixed in #PR` or `fixed`; obsolete to `dropped`; lesson to `lesson`.
  - `index_table(titles: list[str], buckets: dict[str, str], dests: dict[str, str]) -> str`: a header row `| Entry | Bucket | Destination |` and one row per title in the given order, `|` escaped as `\|`; raises `ValueError` if a title has no item.
  - `mark_roadmap(text: str, dests: dict[str, str]) -> str`: inserts `*(→ #N)* ` (the destination, in the same `*( … )* ` frame) after `- [ ] ` on the line whose rest starts with each roadmap ref; raises `ValueError` if a ref matches zero or several lines, or an unticked line gets no marker.

- [ ] **Step 1: Write the failing tests** in `test_migrate.py` with `unittest`, on small hand-made manifests:
  - `test_fresh_run_orders_labels_creates_closes`: two issues, one Accepted, label `debt` missing. Expect `[("label","debt"), ("create","a"), ("create","b"), ("close","b")]`.
  - `test_rerun_skips_existing_titles`: both titles already in `issues`, closed Accepted one `CLOSED`. Expect `[]`.
  - `test_rerun_closes_accepted_left_open`: Accepted title exists `OPEN` as #9. Expect `[("close", "b")]`.
  - `test_existing_issue_labels_become_the_set`: #472 has `bug`, manifest asks `["debt"]`. Expect `("label", "debt")` then `("edit-labels", 472, ["debt"], ["bug"])`; an issue already matching its set gets no action. `test_plan_rejects_unknown_existing_number`: raises `ValueError`.
  - `test_validate_rejects_repeated_title`, `test_validate_rejects_repeated_ref`, `test_validate_rejects_issue_without_body`, `test_validate_rejects_unknown_key`, `test_validate_rejects_issue_item_without_issue`, `test_validate_rejects_fixed_item_with_issue`, `test_validate_rejects_issue_without_item`: each raises `ValueError`.
  - `test_validate_allows_request_without_item`: an item-less issue labelled `request` with a body passes.
  - `test_destinations_per_bucket`: one item per bucket, plus one covered by int 460. Expect `→ #12`, `→ #460`, `fixed in #482`, `fixed`, `dropped`, `lesson`, each under its item's source.
  - `test_buckets_derive_from_issue`: two `issue` items under an Accepted issue and one under an open issue. Expect `Accepted`, `Accepted`, `Open`.
  - `test_index_escapes_pipe` and `test_index_rejects_title_without_item`.
  - `test_mark_roadmap_inserts_after_checkbox`, `test_mark_roadmap_rejects_ambiguous_ref`, `test_mark_roadmap_rejects_unmatched_ref`, `test_mark_roadmap_rejects_unmarked_item`.
- [ ] **Step 2: Run** `cd .claude/backlog-migration && python3 -m unittest test_migrate`. Expected: FAIL, module or functions missing.
- [ ] **Step 3: Implement the functions,** and a CLI `migrate.py dry-run | run`. Both call `validate`, list issues (`--state all`) and labels with `gh ... --limit 1000`, failing if a list returns exactly 1000, and call `plan`. `dry-run` prints each action with the issue title, and `skip: exists as #N (STATE) <title>` for each manifest issue matched by title, then exits. `run` executes them: `gh label create`, `gh issue create --title --body --label` (number parsed from the URL), `gh issue close N --reason "not planned" --comment <why>`, `gh issue edit N --add-label … --remove-label …`. It then re-lists the issues and writes `result.json` from `destinations`. The body sent is `body`, a blank line, then per item `Source of "<ref>": [<path>](https://github.com/<repo>/blob/<mainSha>/<path>#L<a>-L<b>)`, with `, section "<section>"` for a spec item. The path is `docs/known-issues.md` or `docs/roadmap.md` by source, else the item's `path`.
- [ ] **Step 4: Run the tests.** Expected: PASS. Then prove two can fail: drop the `OPEN` check in `plan` and see `test_rerun_skips_existing_titles` fail; drop the escape and see `test_index_escapes_pipe` fail; restore both.
- [ ] **Step 5: Dry run** `python3 migrate.py dry-run`, and show its output to the user. Expected: every label and issue the confirmed list names, no others, no skip line on the first run, and the user's OK.
- [ ] **Step 6: Run** `python3 migrate.py run`, then `dry-run` again. Expected: the second dry run prints only skip lines, one per manifest issue; `result.json` has one destination per item.

### Task 5: Index, markers and pointers, then the PR

**Files:**
- Modify: `docs/known-issues.md` (whole file replaced), `docs/roadmap.md` (header and markers), `README.md` (sections "Roadmap and known issues", the legacy link paragraph, the token paragraph), `src/main/scala/com/lunatech/pointingpoker/PageRoutes.scala` (the legacy links comment), `src/main/scala/com/lunatech/pointingpoker/slug/LegacySlug.scala` (the top comment)
- Create: `CLAUDE.md`

**Interfaces:**
- Consumes: `result.json`, `buckets`, `index_table`, `mark_roadmap` (Task 4); `manifest.json` (Task 1).

- [ ] **Step 1: Generate both files** with a `migrate.py generate` command. First bundle a backup of the branch, `git fetch` and `git rebase origin/main` (the branch is unpushed, so no force push); then read `docs/known-issues.md` and `docs/roadmap.md` from the working tree, which is main's text. Write `known-issues.md` as the header below plus `index_table` over main's `###` titles in file order, with the `known-issues` maps. Write `roadmap.md` as main's text with `mark_roadmap` applied with the `roadmap` map, and the header below inserted after the title line.

`known-issues.md` header:

```markdown
# Known Issues / Technical Debt

Open work lives in this repository's GitHub issues. This file held it until
issue #423 moved it; the table records where each entry went and is never
updated afterwards. Each `#N` shows its live state on GitHub, and each
entry's full text is in this file's git history.
```

`roadmap.md` header, after `# Planning Poker Roadmap` and a blank line:

```markdown
> The modernization this file tracked is delivered, and open work lives in this
> repository's GitHub issues. The file is frozen: each unticked item carries a
> marker saying where it went.
```

- [ ] **Step 2: Check against `main`.** Two counts, independent of `migrate.py`: `git show origin/main:docs/known-issues.md | grep -c '^### '` equals the index's row count, and `git show origin/main:docs/roadmap.md | grep -c -- '- \[ \]'` equals the new file's `grep -c -- '- \[ \] \*('`. Expected: both equal. A failure means a new entry or a mistyped ref: sort it (Task 2's rules, user's OK), file its issue, rerun.
- [ ] **Step 3: Edit the README.** The "Roadmap and known issues" heading becomes `### Open work`. The section text becomes the line `Open work, bugs and technical debt are tracked in the repository's [issues](https://github.com/lunatech-labs/lunatech-pointingpoker/issues).` Remove the sentence "`docs/roadmap.md` schedules its removal." In the token paragraph, "closest to the room-creation hardening listed under Phase 5 in `docs/roadmap.md`." becomes "closest to room-creation hardening." Expected: `grep -n 'roadmap\|known-issues' README.md` prints nothing.
- [ ] **Step 4: Edit the two comments.** `(docs/roadmap.md)` becomes `(issue #N)`, with N the legacy-link removal's destination in `result.json["roadmap"]`. Run `sbt -batch scalafmtCheckAll`. Expected: success; `grep -rn 'docs/roadmap.md' src` prints nothing.
- [ ] **Step 5: Write `CLAUDE.md`:**

```markdown
# Working on this repository

## Open work

Open work lives in this repository's GitHub issues, including findings a PR
surfaces; the PR links its issue. When asked what is next, list the open
issues. Before drafting a new issue, search open and closed issues for it.

## Lessons
```

followed by one bullet per codebase Lesson, its rule as confirmed in Task 2.

- [ ] **Step 6: Commit** the plan, the generated files, the README, the comments and `CLAUDE.md`: `git commit -m "docs: move the backlog to GitHub issues"`.
- [ ] **Step 7: Final review** by one `reviewer` subagent over the branch since `e51b826`, then push and open the PR: title `docs: move the backlog to GitHub issues`, body naming what moved where and `Closes #423`. Merging waits for the user.
