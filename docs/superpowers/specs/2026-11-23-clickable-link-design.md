# Clickable Link

Date: 2026-11-23
Status: Approved
Parent: issue #540

## Purpose

A team pastes a ticket link as the issue, and everyone reads it; today it is
plain text everywhere. This step makes it a link wherever the issue is
shown, so anyone can open the ticket, and on a history row copy its full
URL through the browser's Copy link. It is the UI refresh spec's improve 8
("The issue is a form field"), which the 4c1-wide spec's decision 11 left
"not clickable yet". Out of scope: a URL inside other text, and a bare
ticket key such as `PP-123` (it needs a base URL, a room setting the "tool,
not a platform" lesson rules out).

## Terms

- **Link issue**: an issue that, trimmed, is one `http://` or `https://`
  URL, any case, with no space; the round history spec's decision 5 rule.
- **Short form**: the round history spec's decision 5: what `shortForm` returns,
  a link without its query and fragment, text on one line, an empty issue
  "Round ‹position›".
- **Cut**: what CSS hides when a short form is wider than its history row,
  a link at its front (`…/browse/PP-1233`), text at its end; never a value
  in code, so the DOM and a screen reader keep the whole short form.

## Decisions

1. **What counts.** A link issue, and only that. "Fix login https://…"
   stays text until a team asks for more. The rule moves out of `shortForm`
   (`frontend/src/room/history.ts`) into one exported predicate that
   `shortForm` and decision 3's wrapper both call, so a row's kind and its
   link cannot disagree.
2. **Where.** Every shown issue of a link issue is a link:
   | Place | Shows |
   |---|---|
   | The issue panel's heading | the full issue, in its segments |
   | A round history row | the short form, cut at the front |
   | The Next issue dialog's "Estimate for" legend | the short form |
   | The editor's "Changed by someone else to: …" notice | the full issue |
   | "The room moved on to: …", in the panel and in the dialog | the full issue |

   The two typed fields, the issue editor's and the dialog's next issue,
   stay fields. The product owner confirmed the moved-on row on the mockup.
3. **One wrapper.** `IssueLink({ issue, className, children })` returns the
   children inside `<a className={className} href={issue.trim()}
   target="_blank" rel="noopener noreferrer">` for a link issue, and the
   children alone otherwise. Each place keeps its own rendering inside it:
   the heading's segments, the rows' and legend's `<bdi>` short form, the
   notices' quoted text. A history row's link branch passes its cell's
   classes, so the `<a>` is the cell: its clip then keeps the front cut and
   leaves the focus ring whole, where a link nested in the clipping span
   loses its ring (WCAG 2.4.7). The other places pass no class. The moved-on
   notice writes its sentence in `MovedOn`, the quotes outside the link, as
   the conflict notice does; `movedOnText` goes, and both its sentences are
   checked end to end (Tests). The href is the full trimmed issue, query and
   fragment kept where the short form drops them. Rejected: an `<a>` written at each place (the new-tab rule copied five
   times), and one component that also renders the text (three renderings
   behind a mode switch).
4. **The look.** Ink and underlined, as every link (`ui-reference.md`,
   J4); no icon. The heading keeps its wrap before each slash
   (3b1 decision 4). This reverses the 3a-tokens spec's decision 3, which
   planned a front-cut ellipsis for this step: the panel is the only place
   the full issue reads, on phones too, and the 44 px headline that
   motivated the cut became `--text-lg`. The heading's segments read the
   trimmed issue and take its scheme in any case, as the predicate does.
5. **Targets.** A history row's link is its issue cell, one line (about
   21 px) centred in the 28 px row, which keeps its height. It meets WCAG
   2.5.8 by spacing: 24 px circles centred on neighbouring links stay about
   4 px apart, so a tap between two links opens neither, and the focus ring
   fits between links (at the list's two ends it loses about half a pixel).
   The project's `--target-min` (2.5.5, 44 px) is not met. The legend's link is one label line tall, about 16 px, and passes
   2.5.8 by spacing too: the mockup measures 18 px between it and the first
   chip on the phone.
6. **The legend while sending.** The page's own move often reaches it on
   the stream before the answer to its request, so the sending state keeps
   what the legend shows (round history decision 3). It now keeps the raw
   `{ issue, position }` from the submit instead of the short form, in the
   sending state and the `submit` event, and the dialog derives the short
   form and the link from that pair at render, so they cannot disagree. The
   position stays because an empty issue's short form is "Round
   ‹position›". No mode or event type is added.
7. **Keyboard.** The history list keeps its `tabIndex={0}`, which a list
   without links still needs to scroll.
8. **#571** ("Show a row's full issue on demand") narrows to text rows: a
   link row is opened, or copied, through its link. A "Decided" note on the
   issue says so, its text approved in chat before posting.

## Accepted costs

- A mis-tap on the phone's stacked 28 px rows opens the neighbouring ticket
  in a new tab, closed in one gesture.
- A row's or the legend's link is announced without the query its short
  form drops; the href keeps it.
- A long history puts one tab stop per link row in the sidebar.
- Anyone in the room can make a URL a one-click link for everyone, as they
  can set any issue today; the link shows what was typed, `rel` cuts the
  opener, and the predicate admits only `http` and `https`.
- A double-click on a link opens two tabs.

## Tests

Every case runs in both browsers. A link issue in these cases carries a
query, so an href check fails if the short form's text is used as the href.
The predicate is covered through `shortForm`'s cases (round history spec,
"Short form scenarios"), which assert each kind.

- **Pure logic.** The short form scenarios gain `ftp://example.com/a` and
  `javascript:alert(1)`, both of kind text, so widening the predicate past
  `http` and `https` fails. Decision 6 reshapes, from the `legend` string to
  `{ issue, position }`, the `submit` cases and sending fixtures in
  `nextIssue.test.ts`, "keeps the submitted legend while sending, in its
  round and the next" and "shows no legend when open or closed, nor after a
  failed answer"; the two `movedOnText` cases go with it.
- **End to end.** For a link issue: the heading's link opens the full issue
  in a new tab, `target` and `rel` checked once, the issue padded and its
  scheme upper-case, its segments kept; a history row's link and the
  legend's link carry the full issue; the conflict notice links theirs and
  Use theirs still takes it. The moved-on notice links the new issue in the
  dialog ("a page that finds the room moved on shows the notice") and in the
  panel ("an open issue editor shows the notice once the room moves on, and
  OK puts focus on Edit"), both moving on to a link issue; in each, the
  link's own text is the bare issue, without the quotes, and its href the
  full issue. The first of these cases then reveals again, reopens the
  dialog and moves on to an empty issue: "The room moved on, with no issue
  yet", with no link. For the text issue `PP-1234 Fix the login form`, none
  of the places holds a link. "Next issue moves the room on" submits a link
  issue, and the move that lands while the dialog sends leaves the legend's
  link on it. The front-cut case "a link row keeps its end, a text row its
  start" runs on the new cell and also checks that a link row's first child
  is the `<a>`, with the full href, and a text row's is not. Between
  neighbouring row links, the gap is at least the focused link's outline
  width plus offset.

## Documents

The mockup `docs/design/room.html` shows the link in every place of
decision 2, with `message=moved-on` for the moved-on notice and `theirs=`
for the conflict notice's issue; its links are settled. The 3a-tokens and 4c1-wide specs
are delivered and stay as written; this spec records where it departs from
them.
