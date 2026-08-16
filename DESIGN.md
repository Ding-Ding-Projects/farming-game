# Sprout Hollow — art & design direction

The single source of truth for how the game looks, sounds and feels. Read this before
touching any rendering or UI code.

## 1. Pitch

A quiet, unhurried farm at the bottom of a wooded valley. You have one season's savings,
a rusty hoe and a plot full of rocks. Clear it, work it, and see what the year gives back.

No timers pushing you, no fail state, no menus that look like a settings app. The whole
screen is the game.

## 2. The one rule

**Everything is drawn on one canvas at a fixed low resolution and upscaled with whole
numbers.** No DOM widgets, no CSS components, no design-system chrome. If a thing appears
on screen, it is pixels the game drew.

- Logical framebuffer: **320 × 224**, always.
- Tiles are **16 × 16**. Sprites are drawn on integer pixel coordinates. Never sub-pixel.
- Scale is the largest integer that fits the window (min 2). Letterbox the remainder with
  the deep valley background. Never a fractional scale, never smoothing.
- Text is a hand-built **5 × 7 bitmap font** (`src/engine/font.ts`). No web fonts. Caps-led,
  because that is what fits and it reads like the era we are aiming at.

## 3. Palette

A dusk-leaning, low-saturation set. Warm light, cool shadow — the contrast between the two
is what makes the farm feel like evening even at noon.

| Role | Hex | Used for |
|---|---|---|
| `ink` | `#1b1a24` | Outlines, text on light, the letterbox |
| `shadow` | `#2f2b3d` | Panel shadow, night tint, tile crevices |
| `bark` | `#4a3a34` | Wood UI frames, tree trunks, tilled crevice |
| `soil` | `#6b4a34` | Tilled earth |
| `soilWet` | `#43291f` | Watered earth |
| `grass` | `#4f7a3a` | Ground cover |
| `grassLit` | `#6d9c46` | Grass highlight, leaf tops |
| `leaf` | `#2f5c33` | Plant foliage, canopy shade |
| `parchment` | `#e8d9b0` | Panel interiors, primary text on dark |
| `cream` | `#f6efd8` | Highlights, selected text |
| `lantern` | `#f2a541` | Gold, energy, the "warm" accent, cursor |
| `berry` | `#c1504a` | Danger, withered crops, spend confirmation |
| `sky` | `#8fb8c9` | Water, day sky, cool accent |
| `dusk` | `#5c5470` | Evening overlay, disabled state |

Accents are **lantern** (warm, positive, currency) and **sky** (cool, informational).
`berry` is reserved for loss — never decorative.

## 4. Light

The clock (6:00 AM → 2:00 AM) drives a full-screen tint composited over the world layer only,
never over the HUD:

- Morning 6–10: faint `sky` wash, 6% — cold and early.
- Midday 10–17: no tint. This is the only time the palette shows true.
- Evening 17–20: `lantern` 10% — the good hour.
- Night 20–2: `shadow` up to 38%, easing in. Lit tiles near the house keep a warm pool.

Rain desaturates the world 15% and adds falling streaks; snow adds slow drift and a `cream`
dusting on every tile top edge.

## 5. Motion

Movement is grid-locked but never snaps: the farmer tweens between tiles over 180 ms with a
two-frame walk bob. Everything else moves on a **6-frame-per-second** sub-clock even though
the game renders at 60 — plants sway, water shimmers and the cursor pulses on that slower
beat, so the world reads as animation, not interpolation.

Feedback is short and physical: tilling kicks four dirt specks, harvesting pops the crop up
2 px before it flies to the HUD, a sale flashes the gold counter once. Nothing eases longer
than 250 ms.

Honour `prefers-reduced-motion`: keep tweens, drop particles, screen shake and the sway.

## 6. UI

Panels are carved wood, not cards:

- 3 px `bark` frame, 1 px `ink` outline outside it, 1 px `grassLit`-tinted highlight inside
  the top and left edges only (light falls from the upper left, always).
- Interior is `parchment`, with a 1 px `soil` dither along the bottom edge to seat it.
- Corners are notched by one pixel, never rounded.
- A panel casts a hard 2 px `shadow` offset down-right. No blur, ever.

Buttons are the same frame at 1 px, filling with `lantern` on hover and inverting to
`ink`-on-`cream` when held. Selected tool in the belt sits 2 px higher than its neighbours.

## 7. Sound

Synthesised at runtime through WebAudio — no audio files. Square waves for interface, triangle
for the world. Every sound is under 200 ms and mixes below the ambience:

- `till` — descending two-tone thud; `water` — filtered noise burst
- `plant` — soft rising blip; `harvest` — bright major third
- `sell` — three ascending notes; `deny` — flat low buzz
- `newday` — four-note morning phrase over a held fifth

One master mute, persisted. Audio never starts before the first input.

## 8. What this is not

- Not Material Design, not any design system. No elevation ramps, no state layers, no ripples.
- No rounded corners, no gradients except the sky, no drop shadows with blur.
- No emoji or vector icons anywhere in the game surface — icons are drawn sprites.
- No modal that dims the whole screen to 50% black. Panels sit on the world, lit.

## 9. Accessibility

Being a canvas does not excuse it:

- Every action is reachable from the keyboard; the mouse is optional.
- A visually hidden live region mirrors state changes and panel contents for screen readers
  (`src/renderer/announce.ts`).
- The cursor tile always carries a 2 px `cream` outline that pulses — position is never
  communicated by fill colour alone.
- Text is never below the 5 × 7 face at the current integer scale, and never sits on a
  background within 3:1 contrast of it.

---

# 10. The application shell

Sections 1–9 above describe **the game surface**. This section describes the application
that contains it.

## 10.1 Recorded exemption from the shared UI contract

The shared product UI contract opens with *"Use Material Design 3 tokens, typography,
shape, elevation, motion, and component anatomy."* **This repository is exempt from that
one clause**, by explicit direction: Sprout Hollow uses the game design language defined in
sections 1–9 instead. The exemption covers the M3 visual system only.

Every other clause of that contract applies here in full — including the second half of
that same sentence, the frameless window with a custom title bar. `docs/COMPLIANCE.md`
records each clause and how this repository satisfies it.

## 10.2 Two surfaces, one language

The one-canvas rule in section 2 governs **the game surface** — the farm, its HUD and its
tool belt. It does not govern the application around it.

- **The game surface** is the canvas, unchanged: 320×224, upscaled by whole numbers.
- **The shell** — title bar, tab strip, settings, documentation, history, changelog, the
  command palette, the regex builders and the appearance editors — is real DOM.

The shell is DOM for a reason, and the reason is the contract itself: it requires every
control to be correctly named and stated for assistive technology, keyboard reachable and
visibly focused. Native elements give a screen reader those things truthfully. A canvas
re-implementation would be a costume over an empty stage, and the contract explicitly
refuses costumes — every rendered-looking control must be functional.

The shell is *not* a second design language. It is sections 3, 4 and 6 rendered in CSS:
the same fourteen palette entries as custom properties, carved-wood panels with hard 2 px
shadows, one-pixel notched corners, no radius, no blur, no gradient except the sky, light
from the upper left. Where the shell needs display type it draws it with the game's own
5×7 face onto a canvas, so both surfaces are set in the same letterforms.

## 10.3 Shell specifics

- **Title bar** — frameless, custom, draggable, with real minimise / maximise / close
  controls. Double-click to maximise. It is a `banner` landmark and its controls are
  buttons with accessible names, not glyph divs.
- **Tabs** — persistent and browser-style: overflow, reorder by drag and by keyboard, pin,
  groups with collapse, and the full `tablist` / `tab` / `tabpanel` role set. Closing a tab
  with unsaved work asks first.
- **Density and scale** — usable at 100 / 125 / 150 / 200 % display scale and down to a
  640 px window. Nothing clips, overlaps or leaves the viewport, and no interactive target
  is under 24 × 24 CSS px.
- **Notifications** — informational, success, progress and non-decision failures appear in
  a non-blocking stack that never steals focus. A blocking dialog is reserved for a real
  decision: a destructive confirmation, unsaved work, or consent.
- **Motion** — the shell obeys `prefers-reduced-motion` alongside the game, and the in-app
  motion setting overrides the system preference in either direction.

## 10.4 Language

Three persisted modes — English, playful Hong Kong-style Cantonese, and a compact bilingual
mode — with independent English and Cantonese funny-level controls from 1 to 5.

The funny level restyles **every** message, including warnings and failures. It never edits
a fact: a number, a name, a file path, a key binding, an error code and a crop price read
identically at level 1 and level 5. Only the wrapping voice changes. The setting discloses
this in its own description, in the active language.
