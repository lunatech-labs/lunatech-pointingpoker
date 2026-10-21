# UI Refresh, Step 4c1-foundation: The Stylesheets and the Fonts

Date: 2026-10-21
Status: In discussion
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4

## Purpose

4c1, the room page's look, runs as this step, then 4c1-wide (J10), 4c1-narrow
(J11) and 4c1-editor (J12). This one lays what they and 4c2 build on: the CSS
approach, the mockups' CSS moved into the app, a reset, Bootstrap in a layer
beneath, the tokens loaded, and the fonts served by the app (J7). Its one
visible change: today's pages in Inter, the room id in JetBrains Mono.

## Terms

- **The mockups**: `docs/design/room.html` and `lobby.html`, and the cells
  pages that frame them.
- **The area files**: the stylesheets the mockups' CSS moves into, one per
  owning component or page frame (decision 3).
- **A cold load**: a page load in a fresh browser context, nothing cached.
- **Held back**: a font response delayed past the browser's wait, so the page
  is drawn with the fallback.

## Decisions

1. **Plain CSS, no library.** Modern CSS gives the custom properties, layers
   and container queries, and a static mockup can link plain stylesheets, so
   the app and the mockups, the design tool for steps 4 and 5+, share one
   source. Set aside: a utility library (Tailwind), scoped styles (CSS
   Modules, CSS-in-JS), which a mockup cannot link, and a preprocessor.
2. **The naming convention.** A class's prefix is its owning component
   (`deck-card`, `round-bar`, `issue-panel`, `voters-mark`, `roster-row`);
   the page frames are `room-*` and `lobby-*`; the looks shared across areas
   are `button`, `button-primary`, `panel`, `message-notice` and `brand-logo`.
   A state is styled through its ARIA attribute where today's app has one
   (`.deck-card[aria-pressed="true"]`, the mockups' templates changed to
   match), and CSS nesting syntax is not used; the mockups' descendant
   selectors are kept (my call). The mockups' renaming diff is the record of
   the names. It removes every collision found: with Bootstrap, `card`,
   `mark`, `figure`, `progress`, `row`, `col`, `btn` and `lead`; between the
   two mockups, `app`, `btn`, `chip`, `col`, `header`, `logo`, `messages`,
   `msg`, `notice`, `panel`, `primary`, `problem`, `quiet` and `row`.
3. **All of both mockups' CSS moves into the area files now, which the app
   does not import yet.** Each sits beside its component's TSX
   (`components/Deck.css`), the page frames and the shared looks in their own
   files; the element rules both mockups open with (`html`, `body`, `a`,
   `svg`, `:focus-visible`) go to one `page.css`, every value kept even where
   the reset says the same, since each states the page's intent (the product
   owner's ruling). The mockups link them, as they link `colours.css` and
   `tokens.css` today, and their own `<style>` keeps only what is theirs: the
   rules matching only what `later=1` adds, the probe and the parameter
   switches (my call). The cut follows the reference's areas; 4c1-wide may
   re-cut it when it imports them.
4. **A known reset: Josh Comeau's custom CSS reset**, public domain, copied as
   `frontend/src/reset.css` with its source named, minus
   `-webkit-font-smoothing` (a macOS-only rendering hint nobody judged), its
   `#root` kept. The page's root element becomes `#root`: `#app` was inherited
   from the 2020 Vue page, and only `main.tsx` reads it. The mockups load the
   reset in the same layer the app does.
5. **Layers: `bootstrap` < `reset` < our CSS, unlayered, and today's markup
   fenced off from the reset.** `base.css` declares `@layer bootstrap, reset;`
   and imports Bootstrap and the reset into them, then `colours.css` and
   `tokens.css`. Our rules beat both whatever their specificity, and the reset
   beats Bootstrap wherever it sets a property, not only in Reboot: today's
   pages would lose their centring, grid gutters and button sizes (the spike).
   So `App.tsx` wraps today's tree, the banners, the lobby and the room, in
   `<div class="container legacy-page">`, `container` leaving `#root`, and
   `reset.css` ends with one rule, inside the reset's layer:
   `.legacy-page, .legacy-page *, .legacy-page *::before, .legacy-page
   *::after { all: revert-layer }`. In that layer `revert-layer` falls back to
   Bootstrap's value; in a layer of its own it would fall back to the reset's,
   which the rule's comment says. Each slice moves the markup it replaces out
   of the wrapper; 4c2 deletes the wrapper, the rule and Bootstrap together.
   Set aside: the reset beneath Bootstrap until 4c2, which leaves Bootstrap's
   base rules over the new markup; `@scope`, which Firefox ESR 140 likely
   lacks (inferred). Lightning CSS, Vite's minifier, drops the order
   statement; the order still holds because Bootstrap's rules come first (the
   spike).
6. **The fonts: Fontsource's packages, our own `fonts.css`.**
   `@fontsource-variable/inter` (the latin `wght` file, byte-identical to the
   file the mockups load from Google, checked) and `@fontsource/jetbrains-mono`
   at weight 500, the room id's (my call), as dependencies beside Bootstrap.
   Fontsource's own CSS is not imported: it says `swap` and names the family
   "Inter Variable". Our `fonts.css` declares Inter for weights 100 to 900 and
   JetBrains Mono at 500, latin only, `font-display: optional`, each `url()`
   a bare package path.
7. **A late font never shifts the page.** `optional` lets the browser wait
   briefly, then keep the fallback for the page's life; `index.html` preloads
   both files, so a normal load paints them (my call). The preload href is
   the relative path `../node_modules/…`, the only form Vite rewrites to the
   hashed file the CSS names (the spike).
8. **Licence texts ship beside the files (J7 as written).** A plugin in
   `vite.config.ts` emits each package's `LICENSE` as `assets/inter-OFL.txt`
   and `assets/jetbrains-mono-OFL.txt`, and `fonts.css` opens with a `/*! */`
   comment naming both paths, for anyone who saves the fonts from the page.
   Lightning CSS keeps such a comment only at the very start of the stylesheet,
   so `main.tsx` imports `fonts.css` first, then `base.css`, then
   `styles.css`. Set aside: the plugin prepending the comment after the build,
   which leaves the CSS file's hash naming other bytes.
9. **Dev paints the fonts too.** Vite's dev server leaves the preload href
   alone, and dev then never paints Inter, even on a reload (the spike). The
   same plugin rewrites it to the dev server's `/@fs/` path, in dev only (my
   call), so by-eye checks under `npm run dev` see the real fonts.
10. **What the foundation applies.** `base.css` sets `body` to `--font-sans`,
    and today's room id `<h5>` gets the class the rename gives the mockup's
    room id, set to `--font-mono` there too. Both rules leave `base.css` when
    4c1-wide imports the page frame and the header's file. No other token is
    read yet: the ink, the papers and the fluid root come with each layout.
11. **The gate's new rule: no literal colour and no `px` outside the token
    files.** A test in `frontend/src/design/` reads every `.css` under
    `frontend/src` but `colours.css`, `tokens.css` and `styles.css` (today's,
    replaced as each slice lands) and reports a hex, `rgb()`, `hsl()` or named
    colour other than a system colour, `transparent` or `currentColor`, and
    any `px`. The mockups' CSS complies already (checked).
12. **Bootstrap's own licence banner is lost until 4c2.** Today it opens the
    built CSS and survives; once layered it no longer does (the spike).
    Accepted, since the stack deploys together; if this step ever deploys
    alone, our leading comment gains a Bootstrap clause.

## States and events

The font load, per family, on a cold load of either page.

| Event | The page is drawn | Later |
| --- | --- | --- |
| The font arrives within the browser's wait | in the font | unchanged |
| The font is held back | in the fallback | unchanged when it arrives: no swap, no shift |
| The font fails (404, network down) | in the fallback | unchanged |
| A later page view, the font cached | in the font | unchanged |
| A join from the lobby (one document) | the room in whatever the lobby settled for | unchanged |
| Dev, `npm run dev` | in the font (decision 9) | unchanged |

Accepted race: on a slow network the first visit is drawn in the fallback
throughout, and the next visit in Inter.

## Accepted costs

- Today's pages change by the fonts alone, and Inter is a little wider than
  the system font (inferred), so a line may wrap differently.
- Until 4c2, Bootstrap's base rules still reach the new markup wherever the
  reset sets nothing, such as link colour, heading weight and `label`'s
  display. 4c2's diff before and after Bootstrap's removal turns each into an
  explicit rule.
- A slice that forgets to move its markup out of the wrapper gives it
  Bootstrap's spacing; no case fails, the by-eye check against the mockup sees
  it.
- The licence files keep fixed names under `/assets`' year-long immutable
  caching, so a changed licence text would reach a cached browser late.
- The preloads are fetched on the lobby whether or not a room follows.
- The mockups keep loading their fonts from Google: they must open from a
  checkout without `npm install`, and the Inter file is the same bytes.

## The spike

Run on 2026-10-21 in a throwaway worktree, then removed: Vite 8.3.1, the
production build served by the staged server, Chromium and Firefox; the
layer rows on a bare page with Bootstrap's file.

| What | Result |
| --- | --- |
| Preload href as a bare package path, as `../node_modules/…` | left broken; rewritten to the hashed file the CSS names |
| A bare package path in a CSS `url()` | resolved and hashed |
| `@import … layer(bootstrap)` and the order statement | inlined; the statement dropped, the order kept by first appearance |
| The reset above Bootstrap: `.container`, `.row`, `.form-group`, `.btn-sm`, an icon, a paragraph | the reset's value on each: no centring, no gutters, no margins, a 16 px font, a block icon |
| The same inside `.legacy-page` with decision 5's rule | Bootstrap's value on each; outside it, the reset's |
| A `/*! */` comment anywhere but the stylesheet's start; `fonts.css` imported first | removed by Lightning CSS, Bootstrap's banner included; its comment kept |
| The fonts and licences from `getFromDirectory` | `font/woff2`, `text/plain`, immutable; `/assets/` itself a 404 |
| Cold loads, five per browser | Inter painted in each |
| Inter held back 1.5 s | the fallback kept for the page's life; Chromium reports the face "loaded" anyway, Firefox "error" |
| Dev, preload unrewritten | the fallback on every load; with decision 9, Inter on every load |

## Contract

Every existing case is unchanged. New cases, in `e2e/fonts.spec.js` unless
said, each shown to fail by the mutation beside it. Which font is painted is
read in Chromium through the DevTools protocol's
`CSS.getPlatformFontsForNode`: a face's load status does not say whether it
was drawn (the spike), so Firefox runs only the request-level cases.

| Case | Mutation |
| --- | --- |
| The lobby's text and the room's text are painted in Inter, the room id in JetBrains Mono, after a first load warms the cache | `fonts.css` not imported; the body rule removed; the room id's class removed |
| Each preload names a file the stylesheet's `@font-face` uses, served as `font/woff2` | a bare package href; a preload removed |
| A held-back Inter leaves every element of the room header and the round where it was once the font arrives, and the page in the fallback | `font-display: swap` |
| The stylesheet opens with the licence comment, and each path it names is served as `text/plain` holding the SIL Open Font License | `base.css` imported before `fonts.css`; the plugin removed |
| Today's lobby stays centred and its form keeps Bootstrap's spacing, both browsers | decision 5's rule removed; the rule in a layer of its own |
| The gate's rule (vitest, beside the contrast gate) | a planted `px`; a planted hex; a planted named colour |

The warm-up keeps the paint case off the browser's short wait, which a slow CI
machine could miss; the preload case covers what it skips. The held-back case
waits for the font's response before it measures.

Judged also by two computed-style diffs, every element, in Chromium. Today's
lobby and room before and after, where every difference is the fonts'. The
mockups before and after the move, at each of the cells pages' widths, each
parameter value changed alone from the defaults, `later=1` included (my
call); expected differences come from the reset, and each goes to the
product owner, who rules whether it moves or the move is fixed. And by a hand check under `npm run dev` that the
room id and the text are in their fonts, recorded in the PR.

## The docs' changes

- **Parent**: the Steps table's 4c1 row becomes the four steps' rows, each
  waiting on the one before, 4c1-foundation on 4b2 and 3b4; rows that waited
  on 4c1 wait on 4c1-editor. Step 4's text names the four, plain CSS chosen
  here, and moves the muted Save and Cancel's re-challenge, and #457's two
  deferred cases, to 4c1-editor.
- **Reference**: the Mockups section says the mockups link the app's area
  files and the reset, their `<style>` keeping only their own parts.

## Branches and commits

One PR on `20260930.ui_refresh_4c1_foundation`, stacked on 4b2's
`20260930.ui_refresh_4b2_save_guard` (#457): this document and the parent's
change first, then the code and its cases, the mockups' move with the
reference's change.
