# Graphics contract — 640 × 360

**This document supersedes `DESIGN.md` sections 1–9.** Section 10 (the application shell)
still stands. `DESIGN.md` will be folded into this once the shell wave has landed; where the
two disagree until then, this wins.

The change: the framebuffer doubles and the tile doubles with it. Four times the pixels per
sprite, a world larger than one screen, and animation everywhere something is alive.

## 1. The frame

| | Was | Now |
|---|---|---|
| Framebuffer | 320 × 224 | **640 × 360** |
| Tile | 16 × 16 | **32 × 32** |
| Farm | 20 × 11, all visible | **32 × 24, camera-scrolled** |
| Upscale | whole numbers, min 2 | whole numbers, min 1 (2× = 1280 × 720) |

Everything else about the frame is unchanged and non-negotiable: integer pixel coordinates,
nearest-neighbour upscaling only, never a fractional scale, letterbox the remainder in `ink`.

## 2. The camera

The farm is 1024 × 768 world pixels and the viewport is 640 × 360, so the world no longer
fits on screen. That is deliberate — buildings need room and a farm you can walk out of
feels bigger than one you can see all of.

- The camera follows the farmer with a **deadzone**: it does not move until the farmer
  leaves the middle 192 × 112 box, then eases at 8 px/frame until they are centred again.
- It **clamps to the world bounds** — the player never sees past the edge of the valley.
- It rounds to whole pixels before drawing. A camera on a half pixel smears every sprite.
- Placement mode (see `docs/GAMEPLAY.md`) may pan the camera independently of the farmer.

## 3. Layout

The HUD is now an **overlay**, not a band. The world renders across the entire framebuffer
and the HUD and tool belt sit on top of it, so the viewport gains the 88 px the two bands
used to cost.

- **HUD** — top 40 px. Date, clock, gold, energy, weather. A wood panel that stops short of
  the full width so the valley is visible behind its ends.
- **Tool belt** — bottom 56 px, centred, only as wide as its contents.
- **Light and weather layers composite over the world only** — they are drawn *before* the
  HUD and belt, which are never dimmed. This replaces the old clip-to-world-band rule: the
  clip is now the whole framebuffer, and correctness comes from draw order.

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

## 7. Tiles

Every ground type gets four seasonal variants **and edge transitions** — grass meeting soil,
soil meeting path, land meeting water all need a transition tile or the world reads as a
checkerboard. This is the single biggest visual upgrade available at this resolution and it
is not optional.

- 8 variants per ground type per season, chosen deterministically from `tile.variant`.
- Water gets an animated shoreline and a reflection of whatever stands beside it.
- Tilled soil shows real furrows with a lit crest and a shadowed trough.
- Snow accumulates on the top edge of everything, including buildings and machines.

## 8. What does not change

Sections 6 (UI), 7 (sound), 8 (what this is not) and 9 (accessibility) of `DESIGN.md` carry
over verbatim, with panel and frame dimensions doubled. In particular: no border radius, no
blurred shadow, no gradient except the sky, no emoji in the game surface, and every action
reachable from the keyboard with a live region mirroring state changes.
