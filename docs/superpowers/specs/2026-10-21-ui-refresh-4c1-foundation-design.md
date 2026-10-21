# UI Refresh, Step 4c1-foundation: The Stylesheets and the Fonts

Date: 2026-10-21
Status: In discussion
Parent: `docs/superpowers/specs/2026-09-30-ui-refresh-design.md`, step 4

## Purpose

4c1, the room page's look, runs as this step, then 4c1-mockups, the mockups'
CSS moved into the app
(`docs/superpowers/specs/2026-10-21-ui-refresh-4c1-mockups-design.md`), then
4c1-wide (J10), 4c1-narrow (J11) and 4c1-editor (J12). This one lays what they
and 4c2 build on: the CSS approach, a reset, Bootstrap in a layer beneath, the
tokens loaded, and the fonts served by the app (J7). Its one visible change:
today's pages in Inter, the room id in JetBrains Mono.

## Terms

- **Today's markup**: the Bootstrap-era tree `App.tsx` renders, inside the
  legacy wrapper (decision 3).
- **A cold load**: a page load with nothing cached.
- **Held back**: a font response delayed past the browser's wait, so the page
  is drawn with the fallback.

## Decisions

1. **Plain CSS, no library.** Modern CSS gives the custom properties, layers
   and container queries, and a static mockup can link plain stylesheets, so
   the app and the mockups, the design tool for steps 4 and 5+, share one
   source. Set aside: a utility library (Tailwind), scoped styles (CSS
   Modules, CSS-in-JS), which a mockup cannot link, and a preprocessor.
2. **A known reset: Josh Comeau's custom CSS reset**, public domain, copied as
   `frontend/src/reset.css` with its source named, minus
   `-webkit-font-smoothing` (a macOS-only rendering hint nobody judged), its
   `#root` kept. The page's root element becomes `#root`: `#app` was inherited
   from the 2020 Vue page, and only `main.tsx` reads it.
3. **Layers: `legacy` < `base` < our CSS, unlayered, and today's markup
   fenced off from `base`** (product owner's design). `base.css` declares
   `@layer legacy, base;`, imports Bootstrap then `styles.css` into `legacy`,
   where specificity and order decide between them as they do today, and
   `reset.css` into `base`, then `colours.css` and `tokens.css`; `main.tsx`
   imports neither Bootstrap nor `styles.css` itself. The reset beats
   Bootstrap wherever it sets a property, not only in Reboot, so today's pages
   would lose their centring, gutters and button sizes (the spike). So
   `App.tsx` wraps today's markup, the banners, the lobby and the room, in
   `<div class="container legacy-page">`, `container` leaving `index.html`'s
   root, and `base.css` ends with the fence, `@layer base { .legacy-page,
   .legacy-page *, .legacy-page *::before, .legacy-page *::after { all:
   revert-layer } }`, after every import, so it is last in `base`.
   `revert-layer` there falls back to `legacy`, today's cascade; under another
   layer name it would fall back elsewhere, which its comment says.
   `reset.css` stays as copied. When 4c1-wide has `base.css` import `page.css`
   into `base`, before the fence, the fence undoes it too for today's markup. Each slice moves the markup it
   replaces out of the wrapper; 4c2 deletes the wrapper, the fence and
   `legacy`. Set aside: the reset beneath Bootstrap until 4c2, which leaves
   Bootstrap's base rules over the new markup; `@scope`, which Firefox ESR 140
   likely lacks (inferred); Bootstrap alone in a layer, which hands
   `styles.css` every tie today's specificity settles (the re-review: a
   revealed card under the pointer stays red). Lightning CSS, Vite's
   minifier, drops the order statement; the order holds as `legacy` comes
   first.
4. **The fonts: Fontsource's packages, our own `fonts.css`.**
   `@fontsource-variable/inter` and `@fontsource/jetbrains-mono` as
   dependencies beside Bootstrap; Fontsource's own CSS, which says `swap` and
   names the family "Inter Variable", is not imported. `fonts.css` declares
   Inter for weights 100 to 900 in each of its subsets, latin, latin-ext,
   vietnamese, greek, greek-ext, cyrillic and cyrillic-ext, each with its
   `unicode-range` as Google's CSS does, so a subset is fetched only when a
   character in it is shown (product owner's ruling); and JetBrains Mono at
   500, latin only, room ids being three words from `Slug`'s vocabulary (my
   call). `font-display: swap` throughout (decision 5), each `url()` a bare
   package path. The latin Inter file is byte-identical to the one the mockups load
   from Google (checked).
5. **A late font swaps in once** (product owner's ruling, rewording J7's
   "Step 4 keeps a late font load from shifting the page"). The room is one
   page view kept for a whole meeting, so ending in Inter matters more than
   one early jump. `index.html` preloads the latin Inter and the Mono files
   (my call), so a normal load draws them from the first paint and nothing
   swaps; a slow first load jumps once, before anyone has acted, and a name
   needing a new subset swaps just after the join that brought it, which has
   already refit the table. Each preload is `<link rel="preload" as="font"
   type="font/woff2" crossorigin>`: without `crossorigin` it does not match
   the font request and the file is fetched twice. The href is the relative
   path `../node_modules/…`, the only form Vite rewrites to the hashed file
   the CSS names (the spike). Set aside: `optional`, which keeps the fallback
   for the rest of the page view, a whole meeting here, and in Chromium draws
   a subset that is not preloaded in the fallback on every first view (the
   re-review); `block`, which hides late text up to about 3 s and jumps just
   the same; a fallback scaled to Inter's size, which narrows the jump
   without removing it.
6. **Licence texts ship beside the files (J7 as written).** A plugin in
   `vite.config.ts` emits each package's `LICENSE` as `assets/inter-OFL.txt`
   and `assets/jetbrains-mono-OFL.txt`, and `fonts.css` opens with a `/*! */`
   comment naming both paths, for anyone who saves the fonts from the page.
   Lightning CSS keeps such a comment only at the very start of the stylesheet,
   so `main.tsx` imports `fonts.css` first, then `base.css`. Set aside: the plugin prepending the comment after the build,
   which leaves the CSS file's hash naming other bytes.
7. **Dev paints the fonts too.** Vite's dev server leaves the preload href
   alone, and dev then never paints Inter, even on a reload (the spike). The
   same plugin rewrites it to the dev server's `/@fs/` path, in dev only (my
   call), so by-eye checks under `npm run dev` see the real fonts.
8. **What the foundation applies.** `base.css` sets `body` to `--font-sans`,
    and today's room id `<h5>` takes `room-header-id`, the class 4c1-mockups
    gives the mockup's room id, set to `--font-mono` in `base.css` too. Both
    rules leave `base.css` when 4c1-wide imports `page.css` and
    `room-header.css`. No other token is read yet.
9. **The gate's new rule: no literal colour and no `px` outside the token
    files.** A test in `frontend/src/design/` reads every `.css` under
    `frontend/src` but `colours.css`, `tokens.css` and `styles.css` (today's,
    replaced as each slice lands) and reports a hex, `rgb()`, `hsl()` or named
    colour other than a system colour, `transparent` or `currentColor`, and
    any `px`. The mockups' CSS complies already (checked).
10. **Bootstrap's own licence banner is lost until 4c2.** It opens today's
    built CSS; once layered, Lightning CSS drops it (the spike). Accepted:
    the product owner merges this step through 4c2 in one delivery window,
    about 45 minutes, or with the app stopped.

## States and events

The font load, per family and subset.

| Event | The page is drawn | Later |
| --- | --- | --- |
| The font arrives before first paint (preloaded) | in the font | unchanged |
| The font is late | in the fallback | swapped to Inter on arrival: one jump, the table refit |
| The font fails (404, network down) | in the fallback | unchanged |
| A page view with the font cached | in the font | unchanged |
| A subset first needed later (a name in Ł joins) | those characters in the fallback | swapped to Inter on arrival, just after the join's own change |
| Create or join from the lobby at `/` (`goTo`, a page load) | as a page view, cached by now | unchanged |
| Join on a room's own path (`joinHere`, one document) | the room in what the lobby loaded | as above |

Accepted race: a slow first load, or the first name in a new subset, jumps
once when the font arrives.

## Accepted costs

- Today's pages change by the fonts alone; Inter is a little wider than the
  system font (inferred), so a line may wrap differently.
- Until 4c2, Bootstrap's base rules still reach the new markup wherever the
  reset sets nothing, such as link colour or `label`'s display; 4c2's diff
  before and after Bootstrap's removal makes each an explicit rule.
- From 4c1-wide, `page.css`'s `html` and `body` rules, outside the fence,
  give today's lobby the fluid root and the paper background until 4c2;
  seen only between slices.
- A slice that forgets to move its markup out of the wrapper gives it
  Bootstrap's spacing; no case fails, the by-eye check against the mockup sees
  it.
- The licence files keep fixed names under `/assets`' year-long immutable
  caching, so a changed licence reaches a cached browser late; `PageRoutes`'
  comment on `immutable` says so.
- The Mono preload is fetched on the lobby, which shows no room id until one
  is typed or remembered.

## The spike

Run on 2026-10-21 and removed: Vite 8.3.1, the production build served by the
staged server, Chromium and Firefox; the layer rows on a bare page with
Bootstrap's file.

| What | Result |
| --- | --- |
| The reset above Bootstrap: `.container`, `.row`, `.form-group`, `.btn-sm`, an icon, a paragraph | the reset's value on each: no centring, no gutters, no margins, a 16 px font, a block icon |
| The same inside `.legacy-page` with the fence | Bootstrap's value on each; outside it, the reset's |
| Decision 3's layers against today's cascade: a primary button, a revealed card at rest and under the pointer | today's value on each; with Bootstrap alone layered, the card stays red under the pointer |
| Preload href as a bare package path, as `../node_modules/…` | left broken; rewritten to the hashed file the CSS names |
| Dev, preload unrewritten | the fallback on every load, a reload included |
| A `/*! */` comment not at the stylesheet's start | removed, Bootstrap's banner included |
| The fonts and licences from `getFromDirectory` | `font/woff2`, `text/plain`, immutable; `/assets/` itself a 404 |
| Cold loads, five per browser | Inter painted in each |
| Inter held back 1.5 s, under `optional` | the fallback kept for the page's life; Chromium reports the face "loaded" anyway, Firefox "error" |

## Contract

Every existing case is unchanged. New cases, in `e2e/fonts.spec.js` unless
said, each shown to fail by the mutation beside it, each waiting for
`document.fonts.ready` and two animation frames before it reads a font. Which
font is painted is read in Chromium through the DevTools protocol's
`CSS.getPlatformFontsForNode`, every entry it returns for a node being the
expected web font with `isCustomFont` true, so neither a second font nor one
installed on the machine passes; a face's load status does not say whether it
was drawn (the spike). Firefox reads the face's status instead, which under
`swap` means drawn. The cases keep `fixtures.js`'s guard: they wait for the
font rather than race it, so the HTTP cache the guard's route turns off does
not matter.

| Case | Mutation |
| --- | --- |
| The lobby's text and the room's are painted in Inter, a name with "Ł" too, the room id in JetBrains Mono; both browsers | `fonts.css` not imported; the body rule removed; the room id's class removed; the latin-ext face removed |
| Exactly two preloads, each naming a file the stylesheet's `@font-face` uses, served as `font/woff2`, and each font file requested once per load | a bare package href; a preload removed; `crossorigin` removed |
| A held-back Inter draws the page in the fallback, then in Inter once the held response is released and has arrived; both browsers | `font-display: optional` |
| The stylesheet opens with the licence comment, and each path it names is served as `text/plain` holding the SIL Open Font License | `base.css` imported before `fonts.css`; the plugin removed |
| Today's lobby stays centred and its form keeps Bootstrap's spacing; both browsers | the fence removed; the fence under another layer name |
| The gate's rule (vitest, beside the contrast gate) | a planted `px`; a planted hex; a planted named colour |

Judged also by a computed-style diff of today's lobby and room before and
after, in Chromium, at rest and with each button and card hovered and
focused. Elements pair by their path from the root, the wrapper's level
dropped; the old root's box is compared with the wrapper's, and an element
without a pair is a difference. Every difference is the fonts', but for the
root's `isolation` and the inherited `interpolate-size`, both from the reset,
and the root losing `container`'s width, padding and margin to the wrapper. The mockups
are untouched. And by a hand check under `npm run dev`
that the room id and the text are in their fonts, recorded in the PR.

## The docs' changes

- **Parent**: the Steps table's 4c1 row becomes the five steps' rows, 4c1-mockups
  among them; rows that waited on 4c1 wait on 4c1-editor. Step 4's text names them and plain
  CSS, drops the reset as an open option, and moves the muted Save and Cancel's
  re-challenge and 4b2's two deferred cases, named, to 4c1-editor.
- **Reference**: J7's last line becomes "A late font swaps in once; the latin
  file is preloaded, so a normal load draws Inter from the first paint", with
  the reason in its log entry, a reopening.
- **Code comments**: `PageRoutes`' `immutable` comment and
  `.github/dependabot.yml`'s Bootstrap pin comment ("step 4 decides the
  library") are reworded with the code.

## Branches and commits

One PR on `20260930.ui_refresh_4c1_foundation`, stacked on 4b2's
`20260930.ui_refresh_4b2_save_guard` (#457): this document and the parent's
change first, then the code and its cases.
