# Shell module contract

The application shell that contains the game. Read `DESIGN.md` section 10 and
`docs/COMPLIANCE.md` first. `docs/ARCHITECTURE.md` still governs `src/game`, `src/engine`,
`src/art` and `src/renderer` — none of which this wave may modify except where a file is
explicitly assigned below.

```
  src/shell/core/     stores, i18n, regex engine, history, export. No DOM.
      |
      v
  src/shell/ui/       DOM components. Import core; never import game internals.
      |
      v
  src/shell/app.ts    mounts the shell, owns tabs, hosts the game in the Farm tab.
```

Shared rules for every lane:

- **DOM, not canvas**, except display type (draw with `src/engine/font.ts` onto a canvas).
- **No framework, no new dependency.** Plain TypeScript and `document.createElement`.
- Every control is a real focusable element with an accessible name and correct state.
  No `<div onclick>`. Visible focus everywhere, never `outline: none` without a replacement.
- All colour comes from the CSS custom properties in `src/shell/ui/tokens.css`, which are
  generated from `src/engine/palette.ts`. No literal hex in any other stylesheet.
- Nothing persists except through `src/shell/core/store.ts`. No direct `localStorage`.
- Every user-visible string goes through `t()` from `src/shell/core/i18n.ts`. No bare
  English in a component. Facts interpolate as parameters so the funny level cannot touch
  them.
- Every list, table, picker, menu and settings surface gets a search field, and every
  search field gets its own anchored regex builder and a catalogue entry.

---

## src/shell/core/store.ts — lane: state

```ts
export interface Persisted { settings: Settings; appearance: AppearanceMap; tabs: TabState; history: HistoryEntry[] }
export function load(): Promise<Persisted>
export function save(patch: Partial<Persisted>): Promise<void>
export function subscribe(fn: (p: Persisted) => void): () => void
export function get(): Persisted
export function resetAll(): Promise<void>
```

Versioned, defensive, never throws on malformed stored data — fall back to defaults per
key rather than losing the whole record. Backed by `window.sprout` when present and
`localStorage` otherwise, mirroring `src/renderer/bridge.ts`.

## src/shell/core/i18n.ts + strings.ts — lane: i18n

```ts
export type Lang = 'en' | 'yue' | 'both'
export interface FunnyLevels { en: 1|2|3|4|5; yue: 1|2|3|4|5 }
export function t(key: StringKey, params?: Record<string, string | number>): string
export function setLang(lang: Lang): void
export function setFunny(levels: Partial<FunnyLevels>): void
export function onLangChange(fn: () => void): () => void
export function availableKeys(): StringKey[]
```

`strings.ts` holds, for every key, an English and a Cantonese entry at all five funny
levels. Level 1 is plain and factual; level 5 is theatrical. **Interpolated parameters are
never rewritten at any level** — a test enforces that every level of every key contains the
same parameter placeholders. `both` mode renders `english · cantonese` compactly.

Cover every string in the shell **and** every message `src/game/actions.ts` and
`src/game/shop.ts` return, keyed by a stable id.

## src/shell/core/regex.ts — lane: regex

```ts
export type Dialect = 'ecmascript'
export interface CompileResult { ok: true; re: RegExp } | { ok: false; error: string; index?: number }
export function compile(pattern: string, flags: string): CompileResult
export interface MatchRun { matches: Match[]; truncated: boolean; timedOut: boolean }
export function run(re: RegExp, sample: string, limits?: Limits): MatchRun
export function escapeLiteral(s: string): string
export function plainToPattern(query: string): string
```

State the real dialect (ECMAScript `RegExp`), the real escaping rules and the real bounds.
Bound sample length, match count and elapsed time; abort a run that exceeds the time budget
so an adversarial pattern cannot hang the app. Handle Unicode, multiline, zero-width matches
and no-match cleanly.

## src/shell/core/history.ts + export.ts — lane: history

```ts
export function record(kind: HistoryKind, summary: string, detail?: Record<string, unknown>): void
export function query(filter: { text?: string; pattern?: RegExp; kind?: HistoryKind }): HistoryEntry[]
export function clear(): Promise<void>
export function exportAs(format: 'json' | 'csv' | 'markdown', what: ExportTarget): string
export function download(filename: string, contents: string, mime: string): void
```

Local only. Bounded to a sensible entry count with the oldest dropped. Export covers the
save, the settings, the appearance map and the history.

## src/shell/core/palette-registry.ts — lane: palette

```ts
export interface Command { id: string; titleKey: StringKey; group: string; keywords?: string[]; run(): void }
export interface Target { id: string; titleKey: StringKey; group: string; teleport(): void }
export function registerCommand(c: Command): () => void
export function registerTarget(t: Target): () => void
export function search(query: string, useRegex: boolean): Array<Command | Target>
```

Every tab, settings row, appearance-editable element and documentation section registers a
`Target` whose `teleport()` really focuses it — switching tab, expanding its group,
scrolling it into view and moving focus onto it.

---

## src/shell/ui/tokens.css + base.css — lane: styles

Custom properties for all fourteen palette entries plus spacing, the wood-panel and button
recipes from `DESIGN.md` section 6, focus rings, the notification stack, the scale ladder
(100/125/150/200 %) and a narrow-window path down to 640 px. Reduced-motion block.
Generated tokens must match `src/engine/palette.ts` exactly; a test asserts it.

## src/shell/ui/titlebar.ts — lane: chrome

Frameless custom title bar, `banner` landmark, `-webkit-app-region` drag, real
minimise/maximise/close buttons wired to new `window:*` IPC. Double-click maximises.

## src/shell/ui/tabs.ts + tabmodel.ts + tabsearch.ts — lane: tabs

Persistent browser-style tabs: overflow with a scroll/menu affordance, reorder by drag and
by `Ctrl+Shift+←/→`, pin, named groups with collapse, and the full `tablist`/`tab`/
`tabpanel` roles with `aria-selected` and roving tabindex. `tabsearch.ts` implements the
four searches — current strip, each group, group names, and all app-owned tabs — plus
**Close tabs containing text** and **Close tabs not containing text** sharing one predicate,
with preview, count, an invalid/empty-query guard, pinned excluded by default, and unsaved
work protected.

## src/shell/ui/searchfield.ts + regexbuilder.ts — lane: regex

One reusable search field that owns its own builder in an anchored popover. Plain text is
the default; regex is an explicit opt-in toggle. Guided literals, character classes,
anchors, groups, alternation, quantifiers; raw pattern editing; flags; bounded sample text;
live matches with capture groups; syntax feedback; copy and export. **No builder state is
shared between fields.** Patterns are not persisted.

## src/shell/ui/catalogue.ts — lane: regex

The hand-written catalogue of every search surface in the app: id, where it lives, what it
searches. `tests/search-catalogue.test.ts` asserts every registered field appears in it and
every catalogue entry resolves to a real field — a guard that fails when a field is added
without an entry.

## src/shell/ui/settings.ts — lane: settings

The Settings tab: grouped, tabbed sections, its own search field, every control real and
persisted. Sections: Language (mode + both funny levels, with the facts-unchanged
disclosure), Appearance, Motion & accessibility, Display scale, Audio, Game, Data
(export/import/reset), About. Every row registers a palette `Target`.

## src/shell/ui/appearance.ts + colorpicker.ts — lane: appearance

```ts
export function appearanceFor(elementId: string): AppearanceValue
export function attachEditor(el: HTMLElement, elementId: string, opts: EditorOpts): void
export function resetAppearance(elementId: string): void
```

Every rendered element exposes an anchored `Edit appearance…` affordance — context menu and
a keyboard route — editing a persisted, resettable value. Pickers are searchable and
keyboard operable. Colours use a continuous 2-D picker plus hue slider, with bidirectional
translation between hex, `rgb()`, `hsl()` and the named palette entries: editing any
representation updates the others live.

## src/shell/ui/notify.ts — lane: notify

Non-blocking stack, `role="status"` for informational and `role="alert"` for failures,
never steals focus, dismissible, bounded, pauses its timeout on hover and focus.
`confirm()` here is the *only* blocking dialog helper: focus-trapped, Esc-cancellable,
returning a promise. Use it for destructive actions only.

## src/shell/ui/almanac.ts + changelog.ts — lane: docs

Almanac is offline documentation: how to play, every crop with its real numbers **read from
`src/game/crops.ts`** rather than retyped, the full control table, and an accessibility
statement. Changelog renders `CHANGELOG.md`, imported at build time as a string. Both are
searchable with their own builders, and every section registers a palette `Target`.

## src/shell/ui/surprise.ts — lane: docs

The dim-sum surprise: a small, opt-in, playful flourish. **It draws its own pixel art and
ships no photographs and makes no network request** — the shared contract's public-catalog
rule is about not inventing or copying photos, and the offline rule here forbids fetching
them, so the honest implementation is drawn, not sourced. Record this in `COMPLIANCE.md`.

## src/shell/app.ts + src/renderer/main.ts — lane: integration

`app.ts` mounts the title bar, the tab strip and the panels, opens the default tabs, and
hosts the existing canvas game inside the Farm tab — the game keeps its own loop and its own
save. It routes game action messages through `t()`, records them to history, and pauses the
loop when the Farm tab is not visible. `src/renderer/main.ts` is adjusted to mount into a
supplied container instead of owning `document.body`, and to expose `pause()`/`resume()`.
This is the only pre-existing renderer file this wave may change.
