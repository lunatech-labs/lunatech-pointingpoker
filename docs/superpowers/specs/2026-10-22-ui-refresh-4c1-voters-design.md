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

1. **The voters in `testkit/voters.js`, bound to a case by a `voters`
   fixture in `e2e/fixtures.js`** (product owner's rulings). The testkit holds
   the tools that talk to the app without a browser, as `app.js` and `stub.js`
   do, and the fixture only binds one to the case's room and lifetime, as
   `room` and `join` do; 4c1-wide's diff script imports the testkit as it is.
   Given the app's address, a room and names, a call joins each as a voter and
   returns, per voter, `vote(value)`, and one `close()` for the voters it
   joined; a case may call it more than once, and teardown closes each. It
   covers what the layout cases do and nothing more: leaving, the round's
   commands, the issue and role switches stay with the pages, whose own paths
   (the beacon, a closed tab, Leave) the behaviour cases test (product
   owner's ruling). A step whose cases need more, such as several
   facilitators, adds it with its case. Set aside: browser voters, about 14 page loads per case; a page
   rendering fixed snapshots without a server, which tests markup not wired
   to the live app; the voters inline in `fixtures.js` or beside it in
   `e2e/`, testable only through Playwright.
2. **Each voter is a real session.** The join's answer sets the session
   cookie, which the voter sends on every request, and the voter opens
   `/rooms/{roomId}/events` with a fresh `connectionId`, reading and dropping
   its frames: the stream is what keeps a session present past the grace
   period. A session becomes a member only when the server opens its stream,
   which then sends the room's snapshot first, so the call resolves once every
   voter's first frame has arrived. A stream that ends, errors or sends
   nothing for 5 s before its first frame fails the call, naming the voter
   (my call on the limit). `close()` only aborts its voters' streams
   (product owner's ruling): it does not take them out of the room, which a
   leave would, so a case cannot shrink a room with it.
3. **The voters talk to the app, not through the stub** (my call), so a case
   that cuts or buffers a page's session leaves the voters alone.
4. **Every request a voter makes checks its answer**, as `createRoom` does:
   anything but success fails the call, naming the request and its status, a
   vote's 409 during a reveal included, so a case never measures a room short
   of a voter or a vote. A case lets the page's command land, by the toggle's
   text, before its voters act. The vote that leaves every voter confirmed
   reveals the round by itself, which 4c1-wide's cases allow for.

## Spike

Run 2026-10-22 (session scratchpad, `spike-voters`): one browser page and 13
protocol voters in a fresh room. The joins and streams answered in about
0.1 s; the page showed 14 entries, and still 14 after 8 s, past the test
profile's 4 s grace period; 13 distinct votes gave 13 tally entries. A posted
leave removed its entry in about 0.1 s. A join to an id that is not a room
name answered 404; a valid but unknown name creates the room. An aborted
stream still counted 6 s later. A later probe found the server notices only
at its second write after the abort: two votes removed it 5.5 s later, one
did not; with no write, the heartbeats are the writes (15 s,
`SSE.heartbeatInterval`).

## Accepted costs

- The voters hold no page, so nothing reads what they would see; every read
  stays on a browser page.
- A voter's frames are not parsed, so a stream dropped mid-case shows only as
  a missing entry once the server has written to it twice, which with no
  activity takes two heartbeats, and the grace period has passed.

## Contract

No case changes. Judged by its cases, each shown to fail. The testkit's own,
in `test/voters.test.js` against the started app, as `reproduction.test.js`'s
is, each failure matched by the request and status it names:

- every voter's vote succeeds as soon as the call resolves (killed by a call
  that does not wait on its streams: a vote sent before its stream opens
  answers 403);
- a join refused, to an id that is not a room name, fails the call with the
  join's 404 (killed by ignoring the status);
- a blank vote fails its call with 400 (killed likewise).

What a page shows, in `e2e/voters.spec.js`:

- a room of 14 shows 14 entries; once 13 distinct votes have landed and the
  grace period and 2 s more have passed, still 14, and 13 tally entries once
  revealed (killed by a voter that ends its stream after its first frame,
  which the votes' writes expose).

## The docs' changes

- **Parent**: the steps table gains this step's row between 4c1-wide-prep and
  4c1-wide, which now waits on it, and step 4's text names it.
- **README**: the testkit's paragraph names the voters beside the stub and
  the harness.

## Branches and commits

One PR on `20260930.ui_refresh_4c1_voters`, stacked on 4c1-wide-prep's
`20260930.ui_refresh_4c1_wide_prep`: this document with the parent's change
first, then the voters with their own cases, then the fixture with its
browser cases.
