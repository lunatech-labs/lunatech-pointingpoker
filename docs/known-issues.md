# Known Issues / Technical Debt

Open work lives in this repository's GitHub issues. This file held it until
issue #423 moved it; the table records where each entry went and is never
updated afterwards. Each `#N` shows its live state on GitHub, and each
entry's full text is in this file's git history.

| Entry | Bucket | Destination |
| --- | --- | --- |
| The issue editor's phone keyboard behaviour is unverified | Open | → #495 |
| On a phone, the virtual keyboard and the pinned sheet may leave the editing view little room | Open | → #495 |
| A fast double-tap on the round bar may send its command twice | Open | → #495 |
| On a phone, the lobby's banners now lay out at the phone's width, unchecked | Open | → #495 |
| A reveal drops a voter's focus | Open | → #496 |
| Orca may drop a change to the app's other live regions | Open | → #494 |
| Firefox's heading names keep their capitals from `text-transform` | Open | → #494 |
| The Leave link's icon before the word looks slightly off | Open | → #497 |
| At 400% text zoom below 400 px, the editing view's buttons leave the panel in Firefox | Accepted | → #498 |
| The layout cases written under the first test budget run in Chromium alone | Open | → #499 |
| A layout journey failing inside a shared helper does not name its guarantee | Open | → #500 |
| An unrecognized `roomId` silently creates an empty room, with no bookmark continuity | Accepted | → #501 |
| HTTP command ordering is not guaranteed between a client and the server | Accepted | → #502 |
| No rate limiting on mutating room endpoints | Open | → #503 |
| No request payload is validated on any endpoint that takes one | Open | → #504 |
| The grace period does not start until a heartbeat write to the dead connection fails | Accepted | → #505 |
| A room outliving its last member is not covered end to end | Accepted | → #506 |
| The timer generation discard the idle stop relies on has no test | Open | → #507 |
| The room's two timeouts are distinguished only by argument order | Open | → #508 |
| A second tab on the same room displaces the first tab's identity | Accepted | → #509 |
| Tests that pass with the mechanism they name deleted, as a recurring pattern | Lesson | lesson |
| `departureWhileCut`'s comments describe a detection mechanism its own case no longer exercises | Open | → #510 |
| Two SSE tests settle on a wall clock, not a synchronization primitive | Accepted | → #511 |
| The browser suite's apt step is unbounded and now dominates the CI job | Open | → #512 |
| The target design's citations and step claims go stale as its steps land | Lesson | lesson |
| A citation correct at one layer of a stack goes stale at the next | Lesson | lesson |
| A tied vote is broken by JavaScript key order, not by a rule anyone chose | Open | → #513 |
| A Show during a partial re-vote tallies two rounds as one distribution | Open | → #514 |
| A late Re-vote unconfirms a vote cast in the round it reopened | Open | → #515 |
| A late Clear discards the votes cast in the round a Re-vote reopened | Accepted | → #516 |
| A reveal with votes still moves the facilitator's entries | Open | → #517 |
| Only a real e2e failure exercises the artifact upload path | Accepted | → #518 |
| `API.route`'s top-level order is untested, and today it matters | Open | → #519 |
| `Suggestion.suggest` runs the full edit-distance table against every pool word, for any input length | Open | → #520 |
| A command's 401 can leave the connection banner up until the next snapshot | Accepted | → #521 |
| An idle member stays in the old room for the length of a deploy's drain | Accepted | → #522 |
| A screen reader hears the editor's conflict notice, but not its "Use theirs" button | Open | → #494 |
| A screen reader hears the connection lost, but never that it came back | Open | → #494 |
| A deliberate re-click on a role switch, the round bar or the issue editor within the double-click time is ignored | Accepted | → #523 |
| The frontend's type check stops at ES2022 APIs | Lesson | lesson |
| A failure that repeats unchanged is not announced twice by a screen reader | Open | → #494 |
| A full URL pasted into the Join field gets the not-a-room page | Open | → #524 |
| Create pressed twice in flight makes two rooms | Open | → #525 |
