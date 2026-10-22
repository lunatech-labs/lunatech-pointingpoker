# UI Refresh, Step 4c1-voters: Voters Without a Browser

Date: 2026-10-22
Status: In discussion
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4

## Purpose

Step 4's layout cases need a room of 14 voters, with as many distinct values
as the deck allows once revealed, in both roles and both phases, at two
heights and in both browsers. Today every participant is a browser context
joining through the lobby, and no case has more than a handful. This step adds
voters that join and vote over the protocol from the test process, so a case
fills a room cheaply while the pages it measures stay real. 4c1-wide's and
4c1-narrow's cases use them.

## Terms

- **A protocol voter**: a participant the test process joins over HTTP,
  holding its event stream open, with no page.

## Decisions

1. **A `voters` fixture in `e2e/fixtures.js`** (product owner's ruling),
   beside `join`: given names, it joins each into the case's room as a voter
   and returns, per voter, `vote(value)` and `leave()`. It covers what the
   layout cases do and nothing more: the round's commands, the issue and
   role switches stay with the pages. Set aside: browser voters, about 14
   page loads per case; a page rendering fixed snapshots without a server,
   which tests markup not wired to the live app.
2. **Each voter is a real session.** The join's answer sets the session
   cookie, which the voter sends on every request, and the voter opens
   `/rooms/{roomId}/events` with a fresh `connectionId`, reading and dropping
   its frames: the stream is what keeps a session present past the grace
   period. `leave()` posts the leave a page's beacon sends; the fixture's
   teardown aborts every stream still open.
3. **The voters talk to the app, not through the stub** (my call), so a case
   that cuts or buffers a page's session leaves the voters alone.
4. **A failed join or stream fails the call**, with the status, as
   `createRoom` does, so a case never measures a room short of a voter.

## Spike

Run 2026-10-22 (session scratchpad, `spike-voters`): one browser page and 13
protocol voters in a fresh room. The joins and streams answered in about
0.1 s; the page showed 14 entries, and still 14 after 8 s, past the test
profile's 4 s grace period; 13 distinct votes gave 13 tally entries. A posted
leave removed its entry in about 0.1 s, and a join to an unknown room answered
404. An aborted stream still counted 6 s later, the server noticing at its
next write (inferred: the heartbeat is 15 s), which is why `leave()` posts the
leave.

## Accepted costs

- The voters hold no page, so nothing reads what they would see; every read
  stays on a browser page.
- A voter's frames are not parsed, so a broken stream shows only as a missing
  entry on the page.

## Contract

No case changes. Judged by its cases, each shown to fail:

- a room of 14 shows 14 entries, still 14 past the grace period, and 13
  distinct values give 13 tally entries once revealed (killed by a voter that
  never opens its stream);
- a voter's `leave()` removes its entry within the grace period (killed by a
  `leave()` that only aborts the stream);
- a join refused fails the fixture's call (killed by ignoring the status).

## The docs' changes

- **Parent**: the steps table gains this step's row between 4c1-wide-prep and
  4c1-wide, which now waits on it, and step 4's text names it.

## Branches and commits

One PR on `20260930.ui_refresh_4c1_voters`, stacked on 4c1-wide-prep's
`20260930.ui_refresh_4c1_wide_prep`: this document with the parent's change
first, then the fixture and its cases.
