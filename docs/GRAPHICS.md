# Graphics contract — 640 × 448

**This document supersedes `DESIGN.md` sections 1–9.** Section 10 (the application shell)
still stands. `DESIGN.md` will be folded into this once the shell wave has landed; where the
two disagree until then, this wins.

The change: the framebuffer doubles and the tile doubles with it. Four times the pixels per
sprite, and animation everywhere something is alive. The world itself does not change size.

## 1. The frame

| | Was | Now |
|---|---|---|
| Framebuffer | 320 × 224 | **640 × 448** |
| Tile | 16 × 16 | **32 × 32** |
| Farm | 20 × 11, all visible | **20 × 11, all visible** |
| Bands | HUD 24 / world 176 / belt 24 | **HUD 48 / world 352 / belt 48** |
| Window | 1280 × 896 | 1280 × 896 |
| Upscale | whole numbers, min 2 | whole numbers, min 1 (2× = 1280 × 896) |

640 × 448 is **exactly twice** 320 × 224 in both axes, and 32 is exactly twice 16. That one
decision is what the rest of this document rests on. Every layout constant in
`src/game/constants.ts` simply doubled; not one of them changed meaning.

Everything else about the frame is unchanged and non-negotiable: integer pixel coordinates,
nearest-neighbour upscaling only, never a fractional scale, letterbox the remainder in `ink`.

## 2. No camera

**There is no camera. The whole farm is on screen, all of the time.**

The farm is 20 × 11 tiles. At 32 px that is 640 × 352 world pixels, which is precisely the
world band of a 640 × 448 framebuffer. A tile's screen position is therefore, always and
everywhere:

```
sx = tileX * TILE
sy = WORLD_Y + tileY * TILE
```

No scroll offset, no deadzone, no clamp, no rounding of a camera to a whole pixel because
there is no camera to round. Nothing in `src/art` takes a viewport argument.

### Why the resolution doubled instead of the grid

An earlier draft of this contract called for a 32 × 24 farm scrolled by a camera. That was
dropped, and the reasoning is the point of this section.

The goal of the art wave was **four times the pixels per sprite** — enough room for the
five-tone ramp of section 5, which is most of what "more detail" actually means. A bigger
grid delivers none of that. It is an orthogonal change that happens to cost a great deal.

Doubling the framebuffer buys the whole gain and costs nothing outside `src/art`:

- The 20 × 11 grid is unchanged, so tile indices, `FARM_W`/`FARM_H`, the save format and
  every index-keyed structure in `src/game` are untouched.
- The band layout is unchanged in proportion — HUD, world, belt — so the HUD is still a
  band and not an overlay, and the world band is still exactly the farm.
- The window is unchanged at 1280 × 896, which is now a clean 2× rather than a 4×.
- 866 tests keep passing without an edit, because the rules layer never learned a new number.

Resizing the grid instead would have rippled through the rules layer and its tests: the
farmhouse footprint and doorstep in `game/placement.ts`, the eight region rectangles in
`game/regions.ts` that tile the farm exactly once with no gaps, placement reachability,
the map generator's corner pond, save compatibility, and every fixture that names a tile by
index. All of that, and the sprites would still have been 16 px.

### What we gave up, and where the room comes from instead

A scrolling world does feel bigger. We do not get that. What the player gets instead is the
**region ladder** in `game/regions.ts`: the farm starts as one owned meadow surrounded by
seven regions that belong to the town until a deed and a fee say otherwise. Room is bought,
not walked to — and because the whole farm is visible, the land you do not own yet is on
screen from day one, which is a better advertisement for buying it than a horizon is.

### What this means for the art layer

- A sprite may overhang its own tile — a mature fruit tree's canopy is forty-one pixels
  across and reaches twelve above its own tile — but it may **never** leave the world band.
  A canopy that would reach into the HUD gives up its overhang and squats instead.
- Draw order is row order. Everything standing on the ground is bucketed by the row it
  touches and painted far row first, so a near sprite overlaps a far one. A building sorts
  by the **bottom** row of its footprint, because that is the row it stands on.
- Placement mode does not pan anything. The footprint ghost is drawn in place, on the tiles
  it would occupy, because they are already on screen.

## 3. Layout

Three bands, exactly as before and exactly twice the size.

- **HUD** — top 48 px (`HUD_H`). Date, clock, gold, energy, weather, on a wood panel.
- **World** — `WORLD_Y` = 48, `WORLD_H` = 352. The farm, whole.
- **Tool belt** — bottom 48 px from `BELT_Y` = 400. Tool icons, the selected seed, and the
  readout for the tile ahead.

Light and weather composite **over the world band only**. Both install exactly one clip of
the world rectangle and always close it again, so the HUD and the belt are never dimmed and
never rained on. Anything that is interface rather than scenery — the placement ghost — is
drawn after the light layer for the same reason: a preview you cannot read at dusk is no
preview.

## 4. Type

Two faces. Both hand-authored bitmaps, both drawn with `fillRect` on integer coordinates.
No web fonts, ever.

- **Body — 7 × 9, new.** The primary face. Wider counters, a true crossbar on `A` and `H`,
  and room for a proper `%` and `&`. Used for every label, panel and readout.
- **Small — 5 × 7, retained.** The existing face, kept for dense numeric readouts and tight
  belt labels where 7 × 9 will not fit. It is good work and there is no reason to bin it.

Display type scales the body face by whole numbers (2× and 3×). Coverage, the caps-led
rule, and the hollow-box unknown glyph carry over from the old face unchanged.

`site/` regenerates its wordmark and specimens from `font.ts` automatically — the generator
parses the glyph table, so a new face flows through to the landing page and the design-system
cards with no hand editing.

## 5. Palette

The fourteen entries are **unchanged**. They are good and the shell, the landing page and
the design system are all built on them.

What changes is that 32 × 32 has room to actually use them: every sprite now carries a full
ramp — `ink` outline, a dark side, a mid body, a lit edge, and a `cream` specular where the
light catches. At 16 px most sprites could afford three tones. At 32 px they get five, and
that difference is most of what "more detail" means here.

Light still falls from the **upper left**, always.

## 6. Animation

The 6 fps sub-clock stays as the beat for ambient motion. Anything alive animates.

| Subject | Frames |
|---|---|
| Farmer walk | 4 facings × 4 frames |
| Farmer tool use | 3 frames per tool, per facing |
| Farmer idle | 2-frame breathe after 3 s still |
| Animals | idle 2, walk 4, eat 3, happy 2 |
| Machines | idle 1, working 4, ready 2 (with a glow pulse) |
| Water | 4-frame shimmer, plus edge foam |
| Ripe crops | 2-frame sway |
| Chimney smoke | 4 frames, only when the house is lit |
| Trees | 3-frame canopy sway, wind-direction aware |

Particles get a real budget now: dirt clods with gravity on tilling, a splash ring on
watering, a produce pop that arcs to the HUD on harvest, sparkles on gold quality, feathers
when a chicken is startled, steam from a working machine, leaf fall in autumn.

`prefers-reduced-motion` and the in-app motion setting drop every particle, every ambient
sway and every glow pulse to a static frame — but **never** the walk cycle or a tool swing,
because those communicate state rather than decorate it.

The beat comes from `beatOf(frame)` in `src/art/tiles.ts`, where `frame` is the renderer's
60 fps counter; it returns zero under reduced motion, which is what freezes everything that
should freeze in one place. A sprite that takes no `frame` argument reads the same beat
through `setAmbientFrame` in `src/art/scenery.ts`.

## 7. Tiles

Every ground type gets four seasonal variants **and edge transitions** — grass meeting soil,
soil meeting path, land meeting water all need a transition tile or the world reads as a
checkerboard. This is the single biggest visual upgrade available at this resolution and it
is not optional.

- 8 variants per ground type per season, chosen deterministically from `tile.variant`.
- Water gets an animated shoreline and a reflection of whatever stands beside it.
- Tilled soil shows real furrows with a lit crest and a shadowed trough.
- Snow accumulates on the top edge of everything, including buildings and machines.

Every pixel a transition paints lands inside the 32 × 32 box of the tile that owns it — it
never reaches into the neighbour that caused it — so `drawGroundEdges` is safe to call
immediately after `drawGround` for the same tile inside a single loop. A transition can
therefore never be overwritten by a later tile.

## 8. What does not change

Sections 6 (UI), 7 (sound), 8 (what this is not) and 9 (accessibility) of `DESIGN.md` carry
over verbatim, with panel and frame dimensions doubled: a 3 px wood frame is 6 px, the 1 px
ink outline is 2 px, the hard panel shadow is 4 px down-right, and the selected belt tool
sits 4 px above its neighbours. In particular: no border radius, no blurred shadow, no
gradient except the sky, no emoji in the game surface, and every action reachable from the
keyboard with a live region mirroring state changes.

## 9. Seeing it

Electron cannot be photographed in this environment: Win32 `PrintWindow` returns solid black
for Chromium, and on a GPU-less off-screen desktop the renderer never reaches `dom-ready`.
So `tests/shots.test.ts` implements the nine 2D-context calls the art layer actually uses —
`fillStyle`, `fillRect`, `save`, `restore`, `translate`, `scale`, `beginPath`, `rect`,
`clip` — drives the real drawing modules against a real `GameState`, and writes PNGs itself.
The pixels are the game's own.

```
SHOTS=1 npx vitest run tests/shots.test.ts     # writes docs/shots/*.png at 2x
```

It is skipped unless `SHOTS=1`, and CI runs it on every push and uploads the frames. Two
consequences worth knowing:

- **Reach for a tenth context call and the shots break.** That is deliberate. Nine calls is
  a small enough surface to reimplement honestly; a canvas gradient or a `drawImage` is not.
- Each frame is checked for luminance spread, distinct colour count and unpainted pixels. A
  PNG of a uniform colour is a failed render wearing a filename.
