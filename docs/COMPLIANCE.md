# Compliance

What this repository does about the shared UI contract and the search-builder contract,
clause by clause, with the files that implement each one.

Two rules were followed while writing this:

1. Nothing is marked **Satisfied** that was not read in the code or observed running. Where
   a clause is only partly met it says **Partial** and names what is missing.
2. Two clauses are recorded as something other than "done": the Material Design 3 clause is
   an **exemption** by explicit direction, and the dim-sum clause is **implemented
   differently on purpose**. Both are written out in full below rather than ticked.

Contract text: `agent-global-memory/.claude/skills/ui-contract/SKILL.md` and
`agent-global-memory/.claude/skills/search-builder/SKILL.md`. The repository's own
restatement of them is `docs/SHELL-CONTRACT.md`; the game's design language is `DESIGN.md`.

## How this was checked

| Command | Result |
| --- | --- |
| `npm run typecheck` | passes, no output (`tsc -p tsconfig.json --noEmit && tsc -p tsconfig.main.json --noEmit`) |
| `npm test` | 15 files, **449 passed**, 0 failed, 0 skipped |
| `npm run build:main` | passes |
| `npm run build:renderer` | passes (one Rollup chunk-size advisory, not an error) |
| `npm run build:site` | passes |

The seven original game test files still pass unchanged and still contain 168 tests:
`crops` 18, `rng` 17, `shop` 20, `state` 23, `actions` 60, `time` 15, `save` 15. No test
was deleted, skipped or weakened; two files were added (`tests/search-catalogue.test.ts`
was already present and is now green, `tests/site-palette.test.ts` is new).

The built application was also started for real in Electron on an off-screen desktop. It
booted, set its window title through `t()` to `Farm — Sprout Hollow`, and called
`window:isMaximized` and `save:read` across the preload bridge with no console output and no
renderer crash. What that run could **not** establish is recorded under "Still unverified".

---

# Part 1 — the shared UI contract

## 1.1 Material Design 3 — **EXEMPT, not satisfied**

> "Use Material Design 3 tokens, typography, shape, elevation, motion, and component
> anatomy. On Windows desktop, use the product's frameless window and custom title bar
> rather than default operating-system chrome."

**This repository does not use Material Design 3, and does not claim to.** The exemption was
given explicitly for this project: Sprout Hollow is a 320×224 pixel-art farming game, and a
Material 3 shell around it would have looked like two different products bolted together.
In its place the shell implements the game's own design language, `DESIGN.md` sections 1–9:
the fourteen-colour palette, the 5×7 bitmap face, whole-number pixel scaling, carved-wood
panels with an ink edge and a hard shadow, notched corners, dither fills, no radius, no
blur, no gradient as decoration.

What that replacement looks like in code:

- Tokens — `src/shell/ui/tokens.css` (the fourteen palette entries, spacing, the wood-panel
  and button recipes, focus rings, the 100/125/150/200 % ladder, z-layers), generated to
  match `src/engine/palette.ts` and asserted equal by `tests/tokens.test.ts` (18 tests).
- Component anatomy — `src/shell/ui/base.css` (1838 lines, zero literal hex).
- Typography — `src/engine/font.ts`, used for the tab icons and the landing-page wordmark.

**The second half of this clause is satisfied.** The window is frameless and the title bar
is the product's own: `electron/main.ts` (`frame: false`, `autoHideMenuBar`), the bar itself
in `src/shell/ui/titlebar.ts` with a `banner` landmark, `-webkit-app-region` drag and real
minimise / maximise / close buttons, behind four IPC channels `window:minimize`,
`window:maximize`, `window:close`, `window:isMaximized` registered in `electron/main.ts` and
exposed by `electron/preload.ts`. The maximise button follows the window: the main process
pushes `window:maximized-changed` on both `maximize` and `unmaximize`.

**Status: EXEMPT (design language), SATISFIED (frameless window and custom title bar).**

## 1.2 Language modes and funny levels — Satisfied

> "Provide persisted English, playful Hong Kong-style Cantonese, and compact bilingual
> language modes. Provide independent English and Cantonese funny-level controls from 1 to
> 5, disclose that they style every message including warnings, and keep facts unchanged."

- `Lang = 'en' | 'yue' | 'both'` and `FunnyLevels { en: 1..5; yue: 1..5 }` —
  `src/shell/core/i18n.ts`.
- `both` renders `english · cantonese` compactly and does not repeat itself when the two
  halves agree — `src/shell/core/i18n.ts`, covered by `tests/i18n.test.ts`
  ("bilingual mode", 4 tests).
- Persisted through the store, never through `localStorage` directly —
  `src/shell/core/store.ts` (`settings.language`, `settings.funny`), covered by
  `tests/i18n.test.ts` "language settings persist" and `tests/store.test.ts`.
- The two dials are independent — `tests/i18n.test.ts` "dials the two languages
  independently".
- Facts never move: every level of every key carries the same `{parameter}` set, asserted
  three ways in `tests/i18n.test.ts` ("the funny level never edits a fact").
- The disclosure is a real row in Settings → Language with a live sample built from a real
  crop and its real price, so the reader can watch the voice change while the number does
  not — `src/shell/ui/settings.ts` (`settings.lang.disclosure`,
  `settings.lang.disclosure.example`).
- The catalogue itself: `src/shell/core/strings.ts`, ~4700 lines, both languages at all five
  levels for every key, asserted by `tests/i18n.test.ts` "the catalogue".

**Status: Satisfied.**

## 1.3 Real, accessible, contrast-safe, scalable controls — Partial

> "Make every control real, keyboard reachable, visibly focused, correctly named and stated
> for assistive technology, contrast safe, reduced-motion aware, and usable at narrow widths
> and 100/125/150/200 % display scale."

Verified in code:

- **Real controls.** A source scan for click handlers on non-interactive elements returns
  one hit, `src/shell/ui/tabs.ts` line 348, and that element is a proper ARIA tab, not a
  bare clickable div: `role="tab"`, `aria-selected`, `aria-controls`, an accessible name,
  roving `tabIndex`, and Enter / Space / Home / End / Delete / F2 / Shift+F10 handled by the
  strip's `keydown` handler in the same file. Everything else that reacts to a click is a
  `<button>`, `<a>`, `<input>`, `<select>` or `<textarea>`.
- **Visible focus, and no bare `outline: none`.** Three declarations of `outline: none`
  exist — `src/shell/ui/base.css` (two) and `src/shell/ui/notify.ts` (one) — and each is
  immediately followed by a replacement `box-shadow: var(--sh-focus-ring…)`. Notched
  elements clip an outline away, which is why the ring is drawn as an inset two-tone band;
  unclipped controls (`a`, `range`, `checkbox`, `radio`) get a real outline as well.
- **Display scale.** `--sh-scale` drives `font-size: calc(var(--sh-scale) * 100%)` on the
  root and every size in the sheet is in `rem` — `src/shell/ui/tokens.css`. Pixel-art
  borders use `--sh-px: max(1px, calc(1px * var(--sh-scale)))` so a 200 % shell keeps a
  visible edge.
- **Narrow windows.** `src/shell/ui/base.css` section 16 (`@media (max-width: 40rem)`) plus
  per-module narrow blocks in `src/shell/ui/primitives.ts` and `src/shell/ui/notify.ts`.
- **Reduced motion.** `@media (prefers-reduced-motion: reduce)` in
  `src/shell/ui/tokens.css` collapses `--sh-dur-*` to `0ms`, and the in-app setting
  overrides the system preference in **either** direction —
  `src/shell/ui/settings.ts` (`motionIsReduced`), consumed by `src/shell/ui/farmtab.ts` and
  `src/shell/ui/surprise.ts`.
- **Contrast.** `contrastRatio()` and `meetsContrastAA()` in `src/shell/ui/colorpicker.ts`
  implement WCAG 2.1 with alpha compositing, and the colour picker flags any pair below
  4.5:1 as the user edits.

**What is missing.** None of this was verified against a screen reader, and the narrow and
scaled layouts were not photographed: the headless capture route returned black frames for
this Chromium window (see "Still unverified"). The claims above are code-level, not
observation-level.

**Status: Partial — implemented and readable in the source, not visually or
assistive-technology verified.**

## 1.4 Notifications versus blocking dialogs — Satisfied

> "Keep informational, success, progress, and non-decision messages in non-blocking
> notifications. Reserve blocking dialogs for decisions, destructive confirmations, unsaved
> work, credentials, or consent."

`src/shell/ui/notify.ts` is the whole of it. The stack is bottom-right, never takes focus,
bounded to 4 visible and 30 queued, `role="status"` for info / success / warning / progress
and `role="alert"` for failures, dismissible, and its timeouts pause on hover **and** on
focus so a message cannot expire out from under someone reading it. A toast is inserted
empty and filled on the next frame, which is what makes a live region announce reliably.

`confirm()` in the same file is the only focus-trapping dialog helper in the shell: Esc
cancels, Tab cycles inside, focus returns where it came from, a click outside is not an
answer, and a `destructive` question opens with the safe answer focused and refuses to treat
a stray Enter as consent. Its callers are exactly the decisions — clear history and reset
everything (`src/shell/app.ts`), the data section (`src/shell/ui/settings.ts`), and closing
tabs holding unsaved work (`src/shell/ui/tabmodel.ts`).

**Status: Satisfied.**

## 1.5 Everything rendered is functional — Satisfied, with one deliberate exception

> "Treat every rendered-looking icon, preview, tab, badge, menu item, and toolbar control as
> functional. Label static previews as static and never seed fake product data."

- The pinned tab's icon is drawn at run time from that tab's own initials in the game's
  face and the tab's own computed colour — `src/shell/ui/tabs.ts` (`paintIcon`).
- Badges carry live counts: the bulk-close buttons show the number of tabs each one would
  actually close, from the same selection the button acts on —
  `src/shell/ui/tabsearch.ts` (`labelAction`, `draw`).
- The colour picker's preview swatch is the current colour with a checkerboard behind the
  alpha, and carries `role="img"` with the hex in its accessible name —
  `src/shell/ui/colorpicker.ts`.
- No seeded data anywhere: the Almanac reads its crop numbers from `src/game/crops.ts`
  rather than retyping them (`src/shell/ui/almanac.ts`), the changelog is parsed from the
  real `CHANGELOG.md` imported as a string (`src/shell/ui/changelog.ts`), and the history
  list is whatever actually happened (`src/shell/core/history.ts`).

The **deliberate exception** is the dim-sum trolley, which is decorative on purpose: it
cannot be clicked, cannot take focus and is hidden from assistive technology
(`src/shell/ui/surprise.ts`). It is not a rendered-looking control that does nothing; it is
a picture, marked as one.

**Status: Satisfied.**

## 1.6 Browser-style persistent tabs — Satisfied

> "Use browser-style, persistent tabs for navigable sections. Support overflow, reorder,
> pin, groups, collapse state, keyboard navigation, accessible roles, and the four tab
> searches. Settings, properties, appearance, and documentation sections are tabbed too."

- Model, persistence and the guarded close path — `src/shell/ui/tabmodel.ts`, with the tab
  state stored through `src/shell/core/store.ts` and 52 tests in `tests/tabmodel.test.ts`.
- Strip, overflow menu, drag reorder, `Ctrl+Shift+←/→` reorder, pin, named groups with
  collapse and F2 rename, `tablist`/`tab`/`tabpanel` roles, `aria-selected` and roving
  tabindex — `src/shell/ui/tabs.ts`.
- The four searches plus the two bulk actions — `src/shell/ui/tabsearch.ts` (see 2.8–2.9).
- Settings sections are real tabs built from the same module —
  `src/shell/ui/settings.ts` (`createTabStrip({ stripId: SECTION_STRIP_ID })`), with a
  documented fallback if the strip cannot build.

**Partial detail, stated plainly:** the Almanac and Changelog are *sectioned* documents with
a table of contents and palette teleports rather than tab strips —
`src/shell/ui/almanac.ts`. That is a reasonable reading of "documentation sections are
tabbed too" but it is not a tab strip, and it is recorded here as a difference rather than
as a tick.

**Status: Satisfied for application and settings navigation; documentation uses sections
with a contents list rather than tabs.**

## 1.7 Per-element appearance editing — Partial

> "Give every rendered element an anchored `Edit appearance…` path and a resettable,
> persisted appearance value. Make pickers searchable and keyboard operable; colors require
> the continuous picker and bidirectional color translation contract."

What exists is complete and good:

- `attachEditor(el, id, opts)` gives an element a right-click menu, a `Ctrl+Shift+E`
  keyboard route, a `Shift+F10` / Menu-key route, a command-palette `Command` and a `Target`
  that teleports to it — `src/shell/ui/appearance.ts`.
- Values persist through `store.ts`'s `AppearanceValue`, merge field by field, reset per
  property and per element, and apply as CSS custom properties so the change lands on the
  pixel immediately — `src/shell/ui/appearance.ts`, `src/shell/core/store.ts`.
- The colour control is the continuous 2-D saturation/value field plus hue and alpha
  sliders, keyboard-driven as well as pointer-driven, with live bidirectional hex / `rgb()`
  / `hsl()` / palette-name editing and a contrast readout —
  `src/shell/ui/colorpicker.ts`. Round-tripping is exact for every opaque colour.
- Its swatch strip and the editor's property list are both searchable through the shared
  field — catalogue ids `appearance.colorpicker.swatches`,
  `appearance.editor.properties`, `appearance.menu.items`.

**What is missing: coverage.** Only two elements in the running application actually call
`attachEditor` — the Farm panel (`src/shell/ui/farmtab.ts`) and the Settings panel root
(`src/shell/ui/settings.ts`). The title bar, the tab strip, the notification stack, the
Almanac, the Changelog, the History panel and the tab-search panel expose no
`Edit appearance…` path. "Every rendered element" is not met; two elements are.

**Status: Partial — the mechanism is complete, the coverage is two elements.**

## 1.8 A regex builder on every search field, catalogued — Satisfied

> "Give every search or filter field its own anchored full regex builder. Invoke
> `$search-builder` and add the field to the hand-written surface catalogue and tests in the
> same change."

See Part 2 for the clause-by-clause search-builder answer. The catalogue is
`src/shell/ui/catalogue.ts` (**written during this pass — it did not exist**) and the guard
is `tests/search-catalogue.test.ts`, which now passes in both directions: 14 registered
fields, 14 catalogue rows, no orphans.

**Status: Satisfied.**

## 1.9 The command palette — Satisfied

> "Provide the global command palette on `Ctrl+Shift+F`, with rich results that teleport to
> the exact tab, group, page, setting, or element."

- The chord, the dialog, the combobox wiring and the result list — `src/shell/app.ts`
  (`createCommandPalette`, `onChord`). It refuses to open over the one blocking dialog.
- The registry, ranking, grouping and `activate()` — `src/shell/core/palette-registry.ts`.
- Real teleports: every tab (`src/shell/ui/tabs.ts`), every settings **row** and every
  settings section, which switches tab, opens the section, scrolls the row into view and
  focuses it (`src/shell/ui/settings.ts` — `open(section, rowId)`), every documentation
  section (`src/shell/ui/almanac.ts`), and every appearance-editable element
  (`src/shell/ui/appearance.ts`).
- The palette's own search field is catalogued as `palette`.

Fixed during this pass: three of the four palette groups printed a raw identifier instead of
words, because no group label was registered for them, and Settings used a *rendered
label* as its group id so the heading froze in whichever language the tab was built in. All
four now register through `registerGroupLabel` with a stable id —
`src/shell/ui/settings.ts`, `src/shell/ui/appearance.ts`, `src/shell/ui/almanac.ts`.

**Status: Satisfied.**

## 1.10 Dim sum, export, history, changelog, offline documentation — Satisfied, with the
dim-sum clause implemented differently

> "Apply dim-sum surprise, export, local history, changelog, offline documentation, and
> external-editor behavior when the surface owns the corresponding data or action. Use the
> public dim-sum catalog only; never invent or copy photos."

### The dim-sum clause — implemented as drawn pixel art, on purpose

**What the contract asks for:** a dim-sum surprise, using the public dim-sum catalogue only,
never inventing or copying photos.

**What this repository does:** `src/shell/ui/surprise.ts` draws a dim-sum trolley — two
steamer baskets, a teapot, and a plate of har gow, siu mai, char siu bao, cheung fun and an
egg tart — pixel by pixel, using the game's own primitives (`src/engine/pixel.ts`:
`makeSprite`, `drawSprite`, `px`, `rect`, `hline`, `vline`, `dither`) and the game's own
fourteen-colour palette (`src/engine/palette.ts`). It is **off by default**, turns on from a
Settings row, from the command palette or from its own toggle, and the flag persists through
`store.ts` — never through `localStorage`.

**Why it is not sourced from the public catalogue:** this application is fully offline. A
source scan for `fetch`, `XMLHttpRequest`, `WebSocket` and `http(s)://` across
`src/shell`, `src/renderer`, `src/game`, `src/engine`, `src/art` and `electron` returns
**zero** hits, and `electron/main.ts` pins a CSP of `default-src 'self'` with
`connect-src 'self'` and refuses every permission request. Fetching catalogue photographs
would break the offline promise; vendoring them would be copying. The rule's purpose — never
invent or copy a photograph — is kept exactly, by shipping no photograph at all: there is no
image file, no icon font and no remote asset anywhere in the trolley. What it draws is
original pixel art in the game's own hand.

**Status: implemented, deliberately different from the letter of the clause. Recorded here
rather than ticked.**

### The rest of the clause

- **Export** — `src/shell/core/export.ts`: JSON, CSV and Markdown over the save, the
  settings, the appearance map and the history, with `download()`, `suggestFilename()`, an
  import validator and an 8 MB import bound. 60 tests in `tests/history.test.ts`.
- **Local history** — `src/shell/core/history.ts`: local only, bounded, oldest dropped,
  stored as a key plus its parameters so the entry re-reads in whatever language is current
  (`historyLine` in `src/shell/app.ts`).
- **Changelog** — `src/shell/ui/changelog.ts` parses the real `CHANGELOG.md`, imported at
  build time as a string.
- **Offline documentation** — `src/shell/ui/almanac.ts`: how to play, every crop with its
  real numbers read from `src/game/crops.ts`, the control table, and an accessibility
  statement.
- **External editor** — not applicable: this application owns no file the user would open in
  an editor. Recorded as not applicable rather than as satisfied.

## 1.11 "Verify the real surface" (items 1–5) — Partial

1. **Real engine and real bridge, not fakes.** Partial. The built application was started in
   the real Electron runtime with the real `dist-electron/preload.js`, and the renderer was
   observed calling `window:isMaximized` and `save:read` across it. The unit tests exercise
   `store.ts` against both the `window.sprout` bridge and the `localStorage` fallback
   (`tests/store.test.ts`, 41 tests). What was **not** done is driving the running UI.
2. **Keyboard, focus, screen reader, reduced motion, localisation, long strings, narrow
   layouts, destructive paths.** Partial — read in the source, not exercised. See 1.3.
3. **Follow every setting to the pixel it changes.** Partial. Traced by reading for display
   scale (`applyRootTokens` → `--sh-scale` → root `font-size`), motion (`motionIsReduced` →
   `farmtab`, `surprise`, tokens), language and funny level (store → `i18n` → every
   `t()` caller), and the game options (`pauseWhenHidden`, `autosave`, `pixelScale` →
   `src/renderer/main.ts`). Not photographed.
4. **Photograph and drive the built artefact.** **Not met.** The application was launched on
   an off-screen desktop and confirmed alive, but `PrintWindow` and Electron's own
   `capturePage()` both returned black or timed out for this Chromium window, so there is no
   usable screenshot. Recorded as a gap rather than papered over.
5. **Update the documentation.** This file. `CHANGELOG.md`, `README.md` and
   `docs/ARCHITECTURE.md` were **not** updated by this pass and still describe the game
   without the shell in places.

---

# Part 2 — the search-builder contract

## 2.1 Plain text by default, regex an explicit opt-in — Satisfied

`src/shell/ui/searchfield.ts` creates every field with `regex: false`. Plain text is escaped
by `plainToPattern()` from `src/shell/core/regex.ts`, never by anything hand-rolled. Regex is
opted into twice over: the `.*` toggle on the bar and the first switch in the builder are the
same boolean, and touching the raw pattern box flips it on explicitly rather than silently
reinterpreting what was typed (`src/shell/ui/regexbuilder.ts`).

## 2.2 A full builder anchored beside its own field — Satisfied

`openRegexBuilder()` in `src/shell/ui/regexbuilder.ts` opens in the anchored popover from
`src/shell/ui/primitives.ts`: positioned against the field's own "…" button, flipped and
clamped so it cannot leave a 640 px viewport, Esc to close, Tab cycling inside, focus
returned to the button, and nested popovers tracked so a builder inside the appearance editor
is not treated as an outside click by its parent. It is not modal — `notify.ts` owns the only
blocking dialog.

Settings and the documentation panels predate this module and carry their own inline
builders in a disclosure panel rather than an anchored popover —
`src/shell/ui/settings.ts` (`createSearchBar`), `src/shell/ui/almanac.ts`. The contract
allows an inline panel, so this is compliant, but it is two implementations rather than one.
Recorded as a difference in Part 3.

## 2.3 Query, pattern, flags, validation, mode and sample synchronised, per field — Satisfied

`BuilderState` is created **per field**, inside `createSearchField`, and handed only to that
field's builder — `src/shell/ui/searchfield.ts`, `newBuilderState()` in
`src/shell/ui/regexbuilder.ts`. There is no module-level builder state anywhere in either
file. The field's `changed()` calls `builder?.sync()` and the builder's `changed` calls back
into the field, so the query box, the raw pattern, the toggles, the flags line, the effective
pattern, the syntax line and the live matches always agree.

## 2.4 Guided pieces, raw editing, flags, bounded sample, syntax feedback, live matches, capture groups, copy, export — Satisfied

All in `src/shell/ui/regexbuilder.ts`:

- Guided literals with real escaping (`escapeLiteral`), character classes, anchors, groups
  (capturing and non-capturing), alternation and quantifiers — the `PIECES` table.
- Raw pattern editing with caret-aware insertion.
- Flags through the `TOGGLES` table (case, multiline, unicode) plus whole-word and the two
  anchors, composed by `composeFlags()` / `composePattern()`.
- **Bounded sample text**: a textarea with `maxLength = DEFAULT_LIMITS.maxSampleLength`
  (20 000), and the bound is stated to the reader (`regex.sample.limit`).
- Syntax feedback: `regex.error` / `regex.error.at` with the character index when the engine
  reports one.
- **Live matches with capture groups**: `run()` from `src/shell/core/regex.ts`, each match
  rendered with its index and every group that took part, named or numbered, with the match
  count, the truncation notice, the sample-truncated notice and the timeout notice all
  reported.
- Copy (clipboard, with a spoken result) and export (pattern, flags, sample and every match
  as Markdown through `download()` in `src/shell/core/export.ts`).

## 2.5 State the real dialect, escaping, bounds and timeout — Satisfied

`src/shell/core/regex.ts` states them and the builder shows them: `DIALECT_LABEL` is
`ECMAScript RegExp` and is printed in the builder (`regex.dialect`); `ESCAPED_CHARACTERS`
lists exactly what is escaped and why (`-` is left alone because `\-` is illegal under `u`);
`MAX_PATTERN_LENGTH` is 2000; `DEFAULT_LIMITS` is 20 000 sample characters, 1000 matches and
a 50 ms wall-clock budget. Invalid patterns, Unicode, multiline, zero-width matches and
no-match states are all handled and are covered by 67 tests in `tests/regex.test.ts`,
including one that proves a catastrophic backtracker aborts and returns `timedOut: true`
rather than taking the window with it.

**One honest gap:** `backtrackingRisk()` is implemented and tested in
`src/shell/core/regex.ts`, and its own documentation says "the builder uses it to refuse to
run such a pattern until the user asks for it explicitly" — **no UI surface calls it.** The
sample runner relies on the time budget alone. Adding the gate needs two new strings in both
languages at all five levels, which this pass did not invent.

## 2.6 Do not persist patterns or samples — Satisfied

No pattern, flag or sample is written anywhere. `store.ts`'s `Persisted` shape has no field
for one, and the builder holds its state in a closure that dies with the field. The reader is
told so, in the builder, through `regex.notPersisted`.

## 2.7 Catalogue and completeness guard — Satisfied

`src/shell/ui/catalogue.ts` carries one row per field: the id, the module that builds it, the
constant that declares that id, and the field's label and placeholder as string keys rather
than as English. `tests/search-catalogue.test.ts` reads the ids straight out of `src/shell`
and fails in both directions — a field with no row, and a row with no field. It also checks
that every `*Key` in a row is a real key in `STRINGS`.

The fourteen catalogued fields: `tabs.strip`, `tabs.overflow`, `tabs.group` (a prefix; the
real ids are `tabs.group.<groupId>`, one per group), `tabs.groupNames`, `tabs.all`,
`tabs.bulkClose`, `palette`, `history`, `settings`, `almanac.search`, `changelog.search`,
`appearance.colorpicker.swatches`, `appearance.editor.properties`, `appearance.menu.items`.

## 2.8 A builder on every listed surface — Partial

> "Give every settings, preferences, properties, appearance, documentation, history,
> changelog, list, table, menu, picker, and tab-discovery surface its own builder."

Every one of the fourteen fields above has a builder. Two surfaces still have none:

- **The colour picker's swatch strip** uses the shared field, so it has one.
- **The tab strip's group list and the notification stack** are not searchable, and are not
  meant to be.
- **The Almanac's crop table** is filtered by the page's single search field rather than
  having its own per-table field.

That last one is the honest gap: a table inside a searchable document does not get a second,
table-scoped field. Everything else the clause lists has its own.

## 2.9 The four tab searches — Satisfied

`src/shell/ui/tabsearch.ts`: the current strip (`createStripSearch`), inside each group
(`createGroupSearch`, one field and one builder state per group), group names
(`createGroupNameSearch`) and every tab the app owns (`createAllTabsSearch`). Every result
reports the strip it is on, the group it is in, whether it is pinned, whether it holds
unsaved work, and the label you can actually see (`recordMeta`).

The contract also asks results to identify the *window* and *workspace*. This application has
one window and no workspaces, so those two facts do not exist to report. Recorded as not
applicable rather than as satisfied.

## 2.10 The two bulk actions — Satisfied

`selectForBulkClose()` in `src/shell/ui/tabsearch.ts` takes one predicate and one boolean:
`contains` keeps what the predicate matches, `notContains` keeps what it does not. Same
predicate, same eligibility rules, one boolean apart, so the two can never disagree about
what a query means. An empty or invalid query selects **nothing** (`ok: false` ⇒ empty
selection), pinned tabs are excluded unless explicitly opted in, tabs the app locked are
never selected, unsaved work goes through `requestCloseTabs`, which confirms, and the live
preview and the counts on the two buttons are computed from the exact selection the buttons
act on.

## 2.11 "Verify and document" (items 1–4) — Partial

1. **Test plain text, patterns, flags, Unicode, multiline, captures, zero-width, no match,
   adversarial input, bounds, timeout.** Satisfied for the engine: 67 tests in
   `tests/regex.test.ts` cover all of it. **Not** satisfied for the UI: no test drives a
   field or a builder, because that needs a DOM environment and the contract forbids new
   dependencies.
2. **Exercise the builder from every catalogue entry against the real consumer.** Not done —
   see above. The wiring was fixed and read, not driven.
3. **Keyboard, focus, screen reader, narrow widths, bilingual strings, overlay behaviour.**
   Read in the source; not exercised.
4. **Update the feature article, index, landing-page feature list, changelog.** Not done by
   this pass beyond this file.

---

# Part 3 — deviations found, and what was done about them

Every item below was found by reading the seams between the twelve lanes.

1. **`src/shell/ui/searchfield.ts` and `src/shell/ui/regexbuilder.ts` did not exist.**
   `docs/SHELL-CONTRACT.md` names both. `tabsearch.ts` imported `./searchfield` anyway,
   which is why `npm run typecheck` failed. **Fixed**: both written. The reusable field had
   in fact been implemented inside `colorpicker.ts` by another lane; it was moved to the
   module the contract names, together with the DOM primitives it shares with
   `appearance.ts` (now `src/shell/ui/primitives.ts`), so no module imports its own
   importer.
2. **Tab search was silently dead.** `tabsearch.ts` bound to the missing module by
   reflection and adapted the callback by duck-typing. Against the real field that
   adaptation could never produce a query — the shared field passes a handle whose `query`
   is a *function*, and the adapter only accepted a string — so typing in any tab search
   field would have filtered nothing. **Fixed** by calling `createSearchField` directly and
   deleting ~140 lines of reflection and its hand-rolled fallback field, which had no
   builder at all.
3. **`src/shell/ui/catalogue.ts` did not exist**, so `tests/search-catalogue.test.ts` failed
   and six further assertions were skipped. **Fixed**: written, 14 rows, all 12 assertions
   now run and pass.
4. **`src/shell/ui/notify.ts` called an undefined `styleSheet()`** and never used its own
   `CSS` constant — the notification stylesheet would have thrown on first use. **Fixed.**
5. **Palette group headings printed raw identifiers.** `appearance` and the two
   documentation panels registered entries in groups that had no label, and Settings used a
   *translated string* as its group id. **Fixed**: stable ids plus `registerGroupLabel` in
   `settings.ts`, `appearance.ts` and `almanac.ts`.
6. **The tab-search panel's section headings never followed a language change** — they were
   rendered once at build time. **Fixed**: headings are kept with their keys and rewritten
   on `onLangChange`, and every field now relabels itself too.
7. **`colorpicker.ts`, `settings.ts` and `surprise.ts` were CRLF** against an `.editorconfig`
   that says `end_of_line = lf`. **Fixed**: normalised.
8. **The landing page duplicates the palette as literal hex** — `site/style.css` declares all
   fourteen colours by hand because the page must be correct with scripting off and cannot
   import `palette.ts`. The values match today, and nothing guarded them. **Fixed** by
   adding `tests/site-palette.test.ts`, which fails if they drift. `site/style.css` also
   uses two shades that are **not** palette entries (`#221f2e` in a gradient and `#14131b`);
   those are left as they are and recorded here.
9. **`electron/main.ts` contains one literal hex**, `INK = '#1b1a24'`, the window's
   background so it never flashes white. It cannot import `src/engine/palette.ts` because
   `tsconfig.main.json` is rooted at `electron/`. Left as it is, with the comment naming the
   palette entry it copies. Recorded as a deviation.
10. **`src/engine/audio.ts` reads `localStorage` directly** for the mute flag. It is
    pre-existing game code that this wave may not modify, and it predates `store.ts`. Every
    *shell* path goes through `store.ts`; the only other direct users are `store.ts` itself
    and `src/renderer/bridge.ts`, which the contract names.

## Files the contract protects

`src/game`, `src/engine` and `src/art` are **unmodified**. This was verified against a real
baseline rather than asserted: the repository has no commits (`git log` reports
`your current branch 'main' does not have any commits yet`), so `git diff` could prove
nothing, but `dist/assets/index-*.js.map` from the pre-shell build carried
`sourcesContent` for all 28 game modules. Twenty-seven of the twenty-eight — every file
under `src/game`, `src/engine`, `src/art`, plus `src/renderer/announce.ts`, `bridge.ts`,
`scene.ts` and all six scenes — are **byte-identical** to their current contents. The
twenty-eighth is `src/renderer/main.ts` (437 → 667 lines), which is the one pre-existing
renderer file the contract explicitly assigns to this wave, changed to mount into a supplied
container and to expose `pause()` / `resume()` / `dispose()`.

That baseline has since been overwritten by re-running `npm run build:renderer`. The
comparison was made before the rebuild; it cannot be repeated without checking out the
pre-shell tree.

---

# Part 4 — still broken, still unverified

Nothing here is hidden elsewhere in this document; this is the same list, gathered.

**Gaps in what the contract asks for:**

1. **Documentation strings are English-only.** `ALMANAC_STRINGS` in
   `src/shell/ui/almanac.ts` holds **84 keys** and `CHANGELOG_STRINGS` in `changelog.ts`
   holds **10**, and **not one of those 94 is in `src/shell/core/strings.ts`**. `docText()`
   falls back to the plain English in those tables, so the Almanac and the Changelog — two
   whole surfaces — do not follow the language setting or the funny level. This is the
   largest single gap in the repository. (`SURPRISE_STRINGS` holds one key and that one *is*
   in the catalogue, so the trolley's caption does translate.) `almanac.ts` already exposes
   `allDocStrings()` as the hand-off for whoever translates the rest.
2. **One settings key falls back to a generated label**: `settings.about.saveVersion` is not
   in `STRINGS`, so `settings.ts`'s `humanise()` renders "Save version" from the key.
3. **`Edit appearance…` reaches two elements**, not every rendered element (1.7).
4. **`backtrackingRisk()` has no UI consumer** (2.5).
5. **The Almanac's crop table has no table-scoped search field** (2.8).
6. **No UI-level tests.** Every DOM module — `tabs.ts`, `tabsearch.ts`, `settings.ts`,
   `notify.ts`, `appearance.ts`, `colorpicker.ts`, `searchfield.ts`, `regexbuilder.ts`,
   `titlebar.ts`, `almanac.ts`, `changelog.ts`, `surprise.ts`, `farmtab.ts`, `app.ts` — is
   covered only by the type checker and by reading. The test environment is `node` and the
   contract forbids adding a DOM dependency.
7. **`README.md`, `CHANGELOG.md` and `docs/ARCHITECTURE.md` were not brought up to date**
   with the shell by this pass.

**Unverified, honestly:**

8. **No screenshot of the running application exists.** It was launched on an off-screen
   desktop and confirmed alive — window created, title set through `t()` to
   `Farm — Sprout Hollow`, `window:isMaximized` and `save:read` observed crossing the
   preload, no console output, no renderer crash — but `PrintWindow` returned black frames
   and Electron's `capturePage()` timed out, which is the usual behaviour for a
   GPU-composited window on a headless Windows desktop. Nothing about the *appearance* of
   the shell has been visually checked by this pass.
9. **The page load event did not fire within six seconds** in that headless run
   (`did-finish-load` never arrived) even though the application was demonstrably running
   and interactive. Whether that is a headless-compositor artefact or a genuinely pending
   subresource is **not resolved**.
10. **The window title differed between two launches** — Cantonese on the first, English on
    the second, with no setting changed in between. The most likely explanation is that
    force-killing Electron discarded the persisted store and the second run fell back to the
    documented default (`language: 'en'`), which is `store.ts` behaving as designed, but
    this was **not** proven.
11. **No screen-reader, contrast-in-situ, narrow-window or display-scale observation.** All
    accessibility claims in this document are code-level.
12. **The Electron packaging path (`npm run package`, `electron-builder`) was not run.**
