# Sprout Hollow

[![CI](https://github.com/Ding-Ding-Projects/farming-game/actions/workflows/ci.yml/badge.svg)](https://github.com/Ding-Ding-Projects/farming-game/actions/workflows/ci.yml)
[![Release](https://github.com/Ding-Ding-Projects/farming-game/actions/workflows/release.yml/badge.svg)](https://github.com/Ding-Ding-Projects/farming-game/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/Ding-Ding-Projects/farming-game)](https://github.com/Ding-Ding-Projects/farming-game/releases/latest)

A quiet, unhurried pixel-art farming game for the desktop.

You inherit one plot at the bottom of a wooded valley: a season's savings, a rusty hoe, and
ground full of weeds, rocks and fallen logs. Clear it, till it, sow it, water it, and see
what the year gives back. There is no timer pushing you and no way to lose. The whole screen
is the game.

Sprout Hollow is built with Electron, TypeScript and Vite. It renders to a single 320 x 224
canvas that is upscaled by a whole number to fit your window, so the pixels stay square and
the edges stay hard.

**Windows only.** There is no macOS or Linux build. The code has no Windows-specific
dependency and will very likely run on either, but shipping a target nobody tests is worse
than not shipping it, so only the Windows installer is published.

**[Download the latest release](https://github.com/DingDingChae/sprout-hollow/releases/latest)**
&nbsp;·&nbsp; [Website](https://dingdingchae.github.io/sprout-hollow/)

The installer is not code-signed, so SmartScreen will warn the first time you run it. Every
release is built in public by GitHub Actions from the source in this repository, and you can
[build it yourself](#building-it-yourself) instead.

![A spring farm at midday: tilled rows of crops at different growth stages beside a plank
farmhouse, with rocks, fallen logs and a pond on the valley floor](docs/shots/farm-spring-midday.png)

<p align="center">
  <img src="docs/shots/farm-evening.png" width="49%" alt="The farm in the evening, washed in warm lantern light" />
  <img src="docs/shots/farm-winter.png" width="49%" alt="The farm in winter: pale frosted grass, drifting snow, bare trees" />
</p>

These are real frames, not mock-ups. They are produced by `tests/shots.test.ts`, which drives
the game's own art modules through a small software rasteriser and writes the PNGs directly —
see [Screenshots](#screenshots).

## Features

- Four seasons of 28 days each, a day that runs 6:00 AM to 2:00 AM, and a year that turns
  over when winter ends.
- Fifteen crops across spring, summer, fall and winter, from cheap-and-fast starters to slow
  cash crops, including several that keep bearing after the first harvest.
- Weather that matters: rain and storms water the whole farm overnight, snow waters nothing,
  and a crop left dry for three days in a row withers.
- Tools with a cost: tilling, watering, sowing, harvesting, clearing debris, placing
  sprinklers and working fertilizer into the soil all spend energy and daylight. Run out of
  either and you are carried home, lighter in the pocket.
- A shop that stocks the seeds of the current season plus sprinklers and fertilizer, and buys
  your produce at normal, silver or gold quality.
- Everything is deterministic: the same save always plays the same farm, because nothing in
  the rules layer reads the clock or calls the system random number generator.
- Keyboard-first controls, a screen-reader live region mirroring the game state, and support
  for the reduced-motion preference.

## Controls

| Input | Does |
|---|---|
| Arrows / WASD | Walk, and face that way |
| Space / Enter | Use the held tool on the faced tile |
| 1 - 7 | Pick hoe, can, seeds, hand, axe, sprinkler, fertilizer |
| Q / E | Cycle the selected seed |
| B | Shop |
| I | Bag |
| N | Sleep |
| H / F1 | Help |
| M | Mute |
| Esc | Close the top panel |

The mouse is optional: every action is reachable from the keyboard.

## Building it yourself

You need Node.js 22 or newer.

```
npm install
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server, for a quick preview in the browser at the printed URL |
| `npm start` | Builds and runs the real desktop app in Electron |
| `npm test` | Runs the unit test suite (vitest) |
| `npm run typecheck` | Type-checks the renderer and the Electron main process |
| `npm run build` | Type-checks, then builds both processes into `dist/` and `dist-electron/` |
| `npm run package` | Builds and packages an installer into `release/` with electron-builder |

The browser preview plays the whole game; only the save file lives elsewhere. Under Electron,
saves are written to `save.json` in the per-user application data directory. In the browser
preview there is no such file, so a session starts fresh.

## Project layout

```
src/game/       Pure rules: calendar, crops, world generation, actions, shop, save format.
                No canvas, no DOM, no wall clock, no unseeded randomness. Fully testable.
src/engine/     Generic pixel primitives: palette, 5 x 7 bitmap font, drawing helpers,
                input, immediate-mode UI, synthesised audio. Knows nothing about farming.
src/art/        Draws game concepts as pixels: tiles, plants, the farmer, scenery, weather.
src/renderer/   Scenes, the frame loop, and the bridge to Electron.
electron/       Main process and preload script. Imports none of the above.
tests/          Unit tests for the rules layer.
docs/           The module contract every layer is written against.
DESIGN.md       The binding art direction: palette, light, motion, UI, sound.
```

The dependency arrow only ever points one way: `game` knows nothing of `engine`, `engine`
knows nothing of `art`, and `art` knows nothing of `renderer`.

## No assets, no runtime dependencies

There are no image, font or audio files anywhere in this repository, and nothing is
downloaded at runtime.

- Every sprite, tile and particle is drawn from code with rectangle and pixel calls.
- The text is a hand-authored 5 x 7 bitmap face stored as strings.
- Every sound effect is synthesised on the fly with WebAudio oscillators.
- The whole world is generated from a seed, so a farm is a number rather than a file.

The shipped application has no runtime dependencies. Everything in `package.json` is a
development dependency: TypeScript, Vite, vitest, Electron and electron-builder.

## Releases

Every push to `main` publishes a release, and the same workflow can be run manually
from the Actions tab in one click with no inputs to fill in.

Packaging is **Squirrel.Windows**, so each release carries the complete update asset
set: the `Setup.exe`, the `RELEASES` feed, the full `.nupkg` and any generated deltas.

The artifacts are **not code-signed and never will be.** Windows will show an
unknown-publisher or SmartScreen warning on first run, and that warning is accurate —
nothing here carries a signature and no authenticity is claimed. The release workflow
asserts every produced executable actually reports `NotSigned` before it will publish,
and every release lists the SHA-256 of each artifact as generated by the run that
built it.

Each release takes a code name from the public
[dim sum catalogue](https://github.com/Ding-Ding-Projects/dim-sum-photos), chosen
deterministically from the version. The photograph is linked from that catalogue and
never copied here. Run `npm run dish` to see the current one.

### Size of the tree

As published by **v1.0.0**. This is a convenience copy; the release notes are the
record. Reproduce it with `npm run count`.

| Area | Files | Lines |
|---|---:|---:|
| Game rules | 9 | 2,029 |
| Engine | 6 | 1,285 |
| Art | 4 | 1,891 |
| Renderer | 10 | 2,493 |
| Application shell | 27 | 25,548 |
| Electron | 3 | 523 |
| Website | 3 | 704 |
| Tests | 16 | 6,216 |
| Scripts | 3 | 247 |
| Documentation | 11 | 2,297 |
| **Total** | **92** | **43,233** |

## Screenshots

```
SHOTS=1 npx vitest run tests/shots.test.ts
```

Writes real frames to `docs/shots/`. It is skipped by a normal `npm test`.

The renderer is worth explaining, because the obvious approach does not work. Win32
`PrintWindow` returns solid black for any Chromium window — the page is composited on a
surface the OS cannot read back — and on a GPU-less off-screen desktop the renderer never
even reaches `dom-ready`, so an automated Electron capture hangs rather than failing.

The art layer, though, only ever makes nine 2D-context calls: `fillRect`, `fillStyle`,
`save`, `restore`, `translate`, `scale`, `beginPath`, `rect` and `clip`. So the shot renderer
implements exactly those nine, drives the **real** drawing modules against a real game state,
and rasterises the result into a PNG with nothing but `zlib`. No browser, no GPU, no
dependencies, and deterministic — the same seed always produces the same image.

It covers the world layer. The HUD and tool belt are drawn by the scene layer, which needs a
live input and UI instance, so the frames are cropped to the world band rather than faking
chrome that would not be real.

## License

MIT. See [LICENSE](LICENSE).
