# Sprout Hollow

A quiet, unhurried pixel-art farming game for the desktop.

You inherit one plot at the bottom of a wooded valley: a season's savings, a rusty hoe, and
ground full of weeds, rocks and fallen logs. Clear it, till it, sow it, water it, and see
what the year gives back. There is no timer pushing you and no way to lose. The whole screen
is the game.

Sprout Hollow is built with Electron, TypeScript and Vite. It renders to a single 320 x 224
canvas that is upscaled by a whole number to fit your window, so the pixels stay square and
the edges stay hard.

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

## Running it

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

## License

MIT. See [LICENSE](LICENSE).
