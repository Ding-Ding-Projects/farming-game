# Changelog

All notable changes to Sprout Hollow are recorded here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The application ships this file: the Changelog tab renders exactly the text below, read at
build time, so what you see in the app is what is in the repository.

## [Unreleased]

Nothing yet. The next change lands here.

## [1.1.0] - 2026-08-16

The farm becomes a business. Animals, buildings, factories, a market that moves, and a
hundred levels of things to reach for. Version 1.0 saves load straight into it.

### Added

#### Land, animals and buildings

- The valley is divided into eight **regions**. You start owning the home meadow only;
  the rest is bought with gold **and** a land deed, and until you own it you cannot clear
  it. Deeds come from level rewards and boat crates, so land is the one thing gold alone
  never finishes.
- **Clearing now pays.** Every rock, log and patch of weeds yields materials — wood,
  stone, fibre, and occasionally a plank, nail, screw, bolt or duct tape — and three
  experience. Twelve materials in all, and none of them is ever bought or sold.
- **Twenty buildings**, placed anywhere you have cleared, with a per-tile ghost that tints
  each square of the footprint so you can see which corner is the problem before you
  commit. Nothing is spent until the build succeeds. Buildings can be moved for a small
  fee, and pulled down — the animals inside ride along, or are rehoused, or are sold at
  half price, and the plan tells you which before it happens.
- **Twelve species of animal**, each housed in the buildings that will take it. They eat
  from the silo or graze where the season allows, gain and lose friendship, fall ill if
  neglected or left out overnight, and produce on their own clock. Friendship drives both
  how much they give and how good it is.
- Hay: cut grass into the silo through autumn, feed it through winter.

#### Factories and the chains

- **Thirty factories** and **195 recipes** turning raw goods into **213 products**.
  Machines stand on one tile, hold a visible queue, and work through it overnight.
- **Quality carries the whole way down a chain.** A gold wheat makes gold flour makes gold
  bread, and the price multiplies at every step. A batch is graded by its best ingredient,
  and exactly one unit of that grade is taken to set the mark — the rest of your gold
  stays yours to sell.
- Chains run three deep on purpose: wheat to flour to bread, milk to cream to cheese, wool
  to cloth to fabric.
- A job that finishes into a full barn is **held in the machine** and reported in the
  morning, never destroyed.

#### The economy

- Prices move. Every sellable good carries a live supply index: selling floods it, and it
  decays back toward neutral each day at its own rate. Staples barely shift; wine, truffle
  and cheese swing hard.
- A per-good, per-season demand multiplier, and **one market event a week** — bumper
  harvest, shortage, festival, trade caravan, or a quiet week — rolled from the seed and
  announced in the morning report the day it starts.
- **Five ways to sell**: the shipping bin at the closing price, the town market at ten per
  cent more for an hour's walk, the roadside stall where you name the price and the town
  decides how fast it moves, delivery orders at an agreed premium, and boat crates for
  several goods at once.
- **Reputation**, 0 to 1000, starting at 250: it gates the order tiers, scales every sale
  between 0.95x and 1.08x, and is shown as a named rank with the number beside it.
- **Loans and tax.** Borrow against your standing and your farm, pay interest at the end
  of each season, and pay a flat levy on the season's net earnings — itemised as gross,
  expenses, taxable, rate and amount due. Nothing is repossessed and nothing ends the run.

#### Levels, storage and the ladder

- **A hundred levels**, each one opening something real — 161 rungs in all across crops,
  trees, animals, buildings, factories, recipes, regions, storage and selling channels.
  Experience is paid for doing: harvesting, collecting, finishing a machine job, filling an
  order, clearing land, raising a building.
- **Two capped stores.** The silo holds crops and seeds and starts at 150; the barn store
  holds animal produce, artisan goods, purchased supplies and bulk materials and starts at
  200. Both extend twenty times, for gold and for materials that cannot be bought.
- **A full store never eats your work.** A harvest the silo cannot take is refused and the
  crop keeps standing. A purchase with no shelf for it is refused before you are charged.
  A machine holds what will not fit. The stall will not be pulled down with stock still on
  it. Every refusal names the store, the shortfall and what to do about it.
- **Thirty-three crops** (up from fifteen) and **fourteen fruit trees**, spanning all four
  seasons.

#### The morning report

- The overnight pass now runs, in this order: the weather falls and crops grow; animals
  eat, lose friendship if they went hungry, tick their produce clocks and come in from the
  field; machines work their queues; the stall sells; on the last night of a season
  interest accrues and the levy is assessed; the calendar turns; the market heals, the
  week's event is rolled, orders expire and are topped back up, and the day's closing
  prices go into the ledger.
- The report counts what each pass actually did — animals fed and unfed, animals unwell,
  produce waiting, machine jobs finished and blocked, stall units and gold, orders failed,
  the event that began, interest, the season's levy and every level crossed.

#### The Ledger

- A new shell tab: price history as a chart, income and expenses by source and season,
  orders available and accepted, loans with a repay control, and reputation. Every table
  has its own search field with its own anchored regex builder and its own catalogue row,
  and the whole ledger exports as JSON, CSV or Markdown.

### Changed

- `GameState` gains `buildings`, `animals`, `machines`, `hay`, `progression`, `market`,
  `orders`, `loans` and `stall`. `Tile` gains `buildingId` and `machineId`, mirrored from
  the authoritative lists after every verb, so occupancy is answerable per tile.
- `ItemRef` gains a `product` variant that carries quality through the factory chains and a
  `material` variant that never carries one. Keying, naming, pricing, storage routing,
  saving, the inventory screen, the shop screen and the Ledger all handle both.
- `addItem` consults the store cap itself, so no route into the bag can overflow a shelf.
- Harvesting now pays experience, and a harvest is all-or-nothing against the silo.
- The general store buys artisan products over the counter at the catalogue price. It does
  not trade materials.

### Fixed

- A save written by 1.0 loads: every new field arrives at its documented default — level
  one, the home meadow owned, a neutral market, no debt — and a single bad row inside a
  new collection is dropped rather than failing the whole file.

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

[Unreleased]: https://github.com/Ding-Ding-Projects/farming-game/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Ding-Ding-Projects/farming-game/releases/tag/v1.0.0
