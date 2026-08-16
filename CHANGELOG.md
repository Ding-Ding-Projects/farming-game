# Changelog

All notable changes to Sprout Hollow are recorded here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The application ships this file: the Changelog tab renders exactly the text below, read at
build time, so what you see in the app is what is in the repository.

## [Unreleased]

Nothing yet. The next change lands here.

## [1.0.0] - 2026-08-16

The first release. A complete farming game, and the desktop application that contains it.

### Added

#### The farm

- A valley farm of 20 by 11 tiles, generated from the save's seed: a cleared patch by the
  farmhouse, weeds, rocks and fallen logs over the rest, and a pond in one corner.
- Fifteen crops across the four seasons, from cheap-and-fast starters to slow cash crops,
  including five that keep bearing after the first harvest. Every crop's seed cost, sale
  price, growing time, yield and regrowth live in one table that the game and the in-app
  almanac both read.
- Four seasons of 28 days each, and a year that turns over when winter ends. A living crop
  that cannot grow in the new season is cleared when the season turns.
- A day that runs from 6:00 AM to 2:00 AM, where every action costs ten minutes and a
  measure of energy. Run either out and the farmer is carried home: the night still passes,
  but you wake with part of your energy and the doctor takes a fee.
- Seven tools on the belt — hoe, watering can, seed pouch, hand, axe, sprinkler and
  fertilizer — each with its own energy cost and its own refusal when the tile is wrong.
- Growth that counts watered nights rather than calendar days. Rain and storms water every
  tilled tile overnight, snow waters nothing, sprinklers water their four neighbours, and a
  sprouted plant left dry three nights running withers.
- Fertilizer worked into soil before sowing: an extra day of growth every other day, and
  better odds of a silver or gold harvest.
- A shop stocking the current season's seeds plus sprinklers and fertilizer, buying produce
  at its quality and buying goods back at half price.
- A save that is written for you: a versioned file beside the application's data under the
  desktop build, and browser storage in the web preview.
- Determinism throughout: the rules layer never reads the clock and never calls the system
  random number generator, so the same save always plays the same valley.

#### How it looks and sounds

- Everything is drawn from code. There is no image, font or audio file anywhere in this
  repository, and nothing is downloaded at runtime.
- A 320 by 224 framebuffer upscaled by whole numbers only, letterboxed rather than
  stretched, so the pixels stay square at every window size.
- A fourteen-colour dusk-leaning palette, a full-screen light tint driven by the clock, and
  weather layers for rain, storm and snow.
- Plants drawn parametrically from each crop's own art description, so fifteen crops need no
  hand-drawn sheets and no two crops share a fruit colour.
- A hand-authored 5 by 7 bitmap typeface, stored as strings, used by the game, by the
  application's display type and by the landing page's wordmark.
- Sound effects synthesised at play time with WebAudio oscillators — tilling, watering,
  sowing, harvesting, selling, refusals and a four-note morning phrase — with one master
  mute, and no audio before the first input.

#### The application shell

- A frameless window with a custom title bar: a banner landmark, draggable, with real
  minimise, maximise and close buttons and double-click to maximise.
- Persistent browser-style tabs with overflow, reordering by drag and by keyboard, pinning,
  named groups that collapse, and the full tablist, tab and tabpanel role set. Closing a tab
  with unsaved work asks first.
- Four tab searches — the current strip, each group, the group names and every app-owned tab
  — plus "close tabs containing text" and "close tabs not containing text" over one shared
  predicate, with a preview, a count and pinned tabs excluded by default.
- A command palette over every command and every teleportable target: each tab, settings row,
  appearance-editable element and documentation section can be jumped to, which really
  switches the tab, expands the group, scrolls the target into view and moves focus onto it.
- A regular-expression builder on every single search field — guided literals, character
  classes, anchors, groups, alternation and quantifiers, raw pattern editing, flags, bounded
  sample text, live matches with capture groups, syntax feedback and copy — with no state
  shared between two fields and no pattern ever persisted, over one bounded engine that
  gives up on an adversarial pattern instead of freezing the window.
- Three language modes — English, playful Hong Kong-style Cantonese, and a compact bilingual
  mode — with independent English and Cantonese funny levels from 1 to 5. The funny level
  restyles every message, including warnings and failures, and never edits a fact: numbers,
  names, file paths, key bindings, error codes and crop prices read identically at every
  level.
- An appearance system: every rendered element carries an "edit appearance" affordance from
  the context menu and from the keyboard, editing a persisted, resettable value. Colours use
  a continuous two-dimensional picker with a hue slider, translating live between hex,
  `rgb()`, `hsl()` and the named palette entries.
- Local history of what happened, and export of the save, the settings, the appearance map
  and the history as JSON, CSV or Markdown.
- Settings for language, appearance, motion and accessibility, display scale, audio, the
  game and your data, every row of it searchable and reachable from the palette.
- Notifications in a non-blocking stack that never steals focus, with a blocking dialog kept
  for real decisions: a destructive confirmation, unsaved work, or consent.
- This changelog and a complete offline almanac — getting started, the farming loop, energy
  and the clock, water and weather, seasons, the full crop table read live from the game's
  own data, the tool reference, the control table, tips and an accessibility statement.
- A dim-sum surprise: a small, opt-in, off-by-default flourish that draws its own steamer
  baskets, teapot, har gow and siu mai with the game's own pixel primitives. It ships no
  photographs, makes no network request, respects reduced motion, and never obstructs a
  control or takes focus.

#### Accessibility

- Every action is reachable from the keyboard in both the game and the application. The
  mouse is optional everywhere.
- A visually hidden live region mirrors the game's state changes for screen readers, and
  drops repeated identical messages.
- Real focusable controls with accessible names and correct states throughout the shell —
  no clickable divs — and a visible focus ring on every one of them.
- Usable at 100, 125, 150 and 200 per cent display scale and down to a 640 pixel window,
  with no interactive target smaller than 24 by 24 pixels.
- The system reduced-motion preference is honoured by both surfaces, and the in-app motion
  setting overrides it in either direction.

#### Building and shipping

- An Electron desktop build with context isolation on, node integration off, a strict
  content security policy, and exactly three save channels exposed to the renderer.
- Packaged installers built with electron-builder: NSIS for Windows, AppImage for Linux and
  a disk image for macOS.
- A browser preview and a static landing page, both built with Vite from the same source.
- 168 unit tests over the rules layer, and a type-check across the renderer and the Electron
  main process, both run in continuous integration.

[Unreleased]: https://github.com/DingDingChae/sprout-hollow/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/DingDingChae/sprout-hollow/releases/tag/v1.0.0
