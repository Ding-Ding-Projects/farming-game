/**
 * The title screen, at 640x448.
 *
 * A painted valley at dusk with the wordmark over it: three ridge lines, a treeline on
 * the middle one and a fence running along the near slope. The doubled framebuffer buys
 * two real things here — the scenery trees and the fence posts are now drawn at their
 * native 32 px instead of a 2x blow-up of 16 px art, and the wordmark is the 7x9 body
 * face at 3x, which `docs/GRAPHICS.md` section 4 caps display type at.
 */
import type { Scene, SceneCommand, SceneContext } from '../scene'
import { LOGICAL_H, LOGICAL_W, TILE } from '../../game/constants'
import { PAL, shade, withAlpha } from '../../engine/palette'
import { drawText, drawTextCentered, textWidth } from '../../engine/font'
import { px, rect, woodPanel } from '../../engine/pixel'
import { playSound, unlockAudio } from '../../engine/audio'
import { artNoise, mixHex } from '../../art/tiles'
import { drawFencePost, drawTree } from '../../art/scenery'
import { createHelpScene } from './help'

const HORIZON = 256
const FAR_RIDGE = 236
const MID_RIDGE = 284
const NEAR_RIDGE = 336

const SKY_TOP = mixHex(PAL.dusk, PAL.sky, 0.5)
const SKY_LOW = mixHex(PAL.lantern, PAL.parchment, 0.45)
const FAR_HILL = mixHex(PAL.dusk, PAL.shadow, 0.45)
const MID_HILL = shade(PAL.leaf, -0.35)
const NEAR_HILL = shade(PAL.grass, -0.5)

const BUTTON_W = 232
const BUTTON_X = Math.floor((LOGICAL_W - BUTTON_W) / 2)
const BUTTON_H = 30
const BUTTON_Y = 208
const BUTTON_PITCH = 42

/** The confirmation over the wipe. Sized so neither answer sits under the other. */
const CONFIRM_X = 96
const CONFIRM_Y = 176
const CONFIRM_W = LOGICAL_W - CONFIRM_X * 2
const CONFIRM_H = 148
const CONFIRM_BTN_W = 176
const CONFIRM_BTN_H = 30

/** A ridge line that wanders, so no hill reads as a rectangle. */
function ridge(x: number, base: number, seed: number): number {
  const wobble =
    6.4 * Math.sin(x * 0.0205 + seed) +
    3.6 * Math.sin(x * 0.0565 + seed * 2.1) +
    2.2 * Math.sin(x * 0.0035 + seed * 0.6)
  return Math.round(base + wobble)
}

function hill(ctx: CanvasRenderingContext2D, base: number, seed: number, color: string): void {
  const lit = mixHex(color, PAL.cream, 0.16)
  const rim = mixHex(color, PAL.cream, 0.3)
  for (let x = 0; x < LOGICAL_W; x++) {
    const top = ridge(x, base, seed)
    rect(ctx, x, top, 1, LOGICAL_H - top, color)
    // Two pixels of rim light on the crest, because the sun is behind the ridge.
    px(ctx, x, top, rim)
    px(ctx, x, top + 1, lit)
  }
}

/** A filled circle laid out row by row, so it stays a pixel shape and not a rectangle. */
function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, d: number, color: string): void {
  const r = d / 2
  for (let y = 0; y < d; y++) {
    const dy = y - r + 0.5
    const half = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)))
    if (half <= 0) continue
    rect(ctx, Math.round(cx - half), Math.round(cy - r + y), half * 2, 1, color)
  }
}

function sky(ctx: CanvasRenderingContext2D): void {
  for (let y = 0; y < HORIZON; y++) {
    rect(ctx, 0, y, LOGICAL_W, 1, mixHex(SKY_TOP, SKY_LOW, y / HORIZON))
  }
  rect(ctx, 0, HORIZON, LOGICAL_W, LOGICAL_H - HORIZON, SKY_LOW)

  // A low sun sinking into the far ridge, with its halo, and streaked cloud above.
  const sunX = 536
  const sunY = FAR_RIDGE - 14
  disc(ctx, sunX, sunY, 34, withAlpha(PAL.lantern, 0.1))
  disc(ctx, sunX, sunY, 24, withAlpha(PAL.lantern, 0.14))
  disc(ctx, sunX, sunY, 16, mixHex(PAL.lantern, PAL.cream, 0.3))
  disc(ctx, sunX, sunY - 2, 8, mixHex(PAL.lantern, PAL.cream, 0.7))

  for (let i = 0; i < 14; i++) {
    const cx = Math.floor(artNoise(i, 3) * LOGICAL_W)
    const cy = 28 + Math.floor(artNoise(i, 4) * 140)
    const w = 36 + Math.floor(artNoise(i, 5) * 68)
    rect(ctx, cx, cy, w, 2, withAlpha(PAL.cream, 0.2))
    rect(ctx, cx + 8, cy + 2, Math.max(12, w - 20), 2, withAlpha(PAL.cream, 0.12))
    rect(ctx, cx + 18, cy - 2, Math.max(8, w - 34), 1, withAlpha(PAL.cream, 0.1))
  }
}

function valley(ctx: CanvasRenderingContext2D): void {
  sky(ctx)
  hill(ctx, FAR_RIDGE, 0.4, FAR_HILL)

  // The treeline stands on the middle ridge, before the near hill buries its roots.
  // Native 32 px now: no `ctx.scale`, so the wood is drawn at the resolution it was
  // authored for rather than as a doubled 16 px sprite.
  for (let i = 0; i < 15; i++) {
    const x = -20 + i * 46 + Math.floor(artNoise(i, 21) * 18)
    const y = ridge(x + 18, MID_RIDGE, 1.1) - 26
    drawTree(ctx, x, y, artNoise(i, 22) > 0.7 ? 'fall' : 'summer', i)
  }
  hill(ctx, MID_RIDGE, 1.1, MID_HILL)
  hill(ctx, NEAR_RIDGE, 2.3, NEAR_HILL)

  // A fence line running along the near slope. The rails reach both tile edges, so
  // posts exactly one tile apart make an unbroken run.
  for (let i = 0; i < 21; i++) {
    const x = -TILE + i * TILE
    drawFencePost(ctx, x, ridge(x + 16, NEAR_RIDGE, 2.3) + 4)
  }

  // Foreground turf below the fence, so the near slope is grass rather than a flat
  // block of colour: tufts lit on their upper left, thinning as they recede.
  const tuftLit = mixHex(NEAR_HILL, PAL.grassLit, 0.8)
  const tuftMid = mixHex(NEAR_HILL, PAL.grassLit, 0.4)
  const tuftDark = mixHex(NEAR_HILL, PAL.ink, 0.45)
  for (let i = 0; i < 520; i++) {
    const x = Math.floor(artNoise(i, 61) * LOGICAL_W)
    const base = ridge(x, NEAR_RIDGE, 2.3) + 22
    const y = base + Math.floor(artNoise(i, 62) * (LOGICAL_H - base))
    if (y >= LOGICAL_H - 2) continue
    // Nearer the camera means taller, so the slope has depth rather than a flat speckle.
    const near = (y - base) / Math.max(1, LOGICAL_H - base)
    const h = 3 + Math.floor(near * 5) + Math.floor(artNoise(i, 63) * 3)
    rect(ctx, x, y, 1, h, tuftDark)
    rect(ctx, x - 1, y + 2, 1, h - 2, tuftMid)
    rect(ctx, x + 1, y + 1, 1, h - 1, artNoise(i, 64) > 0.45 ? tuftLit : tuftMid)
    px(ctx, x, y - 1, tuftLit)
  }

  // One wash pushes the whole valley behind the lettering without dimming it to mud.
  rect(ctx, 0, 0, LOGICAL_W, LOGICAL_H, withAlpha(PAL.shadow, 0.44))
}

/** The bitmap face blown up by drawing every glyph pixel as a `scale` square block. */
function bigText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  scale: number,
  color: string,
): void {
  const x = Math.floor(cx - (textWidth(text) * scale) / 2)
  ctx.save()
  ctx.translate(x, Math.floor(y))
  ctx.scale(scale, scale)
  drawText(ctx, text, 0, 0, color)
  ctx.restore()
}

export function createTitleScene(): Scene {
  let confirming = false
  /** The dangerous button is never the one already under the cursor. */
  let confirmOpened = false

  return {
    id: 'title',

    update(ctx: SceneContext, input, ui, dt, frame): SceneCommand | null {
      ctx.tick(dt, frame)
      const g = ctx.g
      if (input.anyPressed()) unlockAudio()
      ctx.toastY = LOGICAL_H - 12

      valley(g)

      bigText(g, 'SPROUT HOLLOW', LOGICAL_W / 2 + 6, 66, 3, withAlpha(PAL.ink, 0.55))
      bigText(g, 'SPROUT HOLLOW', LOGICAL_W / 2, 60, 3, PAL.cream)
      drawTextCentered(
        g,
        'A QUIET FARM AT THE FOOT OF THE VALLEY',
        LOGICAL_W / 2,
        120,
        PAL.parchment,
        { shadow: PAL.ink },
      )

      ui.begin(g, input)

      if (confirming) {
        const before = ui.focusedId()
        if (input.pressed('ArrowLeft') || input.pressed('KeyA')) ui.focusNext(-1)
        if (input.pressed('ArrowRight') || input.pressed('KeyD')) ui.focusNext(1)
        if (ui.focusedId() !== before) playSound('select')

        woodPanel(g, CONFIRM_X, CONFIRM_Y, CONFIRM_W, CONFIRM_H)
        const mid = CONFIRM_X + CONFIRM_W / 2
        drawTextCentered(g, 'START A NEW FARM?', mid, CONFIRM_Y + 22, PAL.ink)
        drawTextCentered(g, 'THE FARM ALREADY IN THE VALLEY', mid, CONFIRM_Y + 48, PAL.ink)
        drawTextCentered(g, 'WILL BE LOST FOR GOOD.', mid, CONFIRM_Y + 64, PAL.berry)

        const btnY = CONFIRM_Y + CONFIRM_H - CONFIRM_BTN_H - 20
        const keep = ui.button('title.keep', 'KEEP IT', CONFIRM_X + 28, btnY, CONFIRM_BTN_W, CONFIRM_BTN_H)
        const wipe = ui.button(
          'title.wipe',
          'START OVER',
          CONFIRM_X + CONFIRM_W - CONFIRM_BTN_W - 28,
          btnY,
          CONFIRM_BTN_W,
          CONFIRM_BTN_H,
        )
        if (confirmOpened) {
          for (let i = 0; i < 2 && ui.focusedId() !== 'title.keep'; i++) ui.focusNext(-1)
          confirmOpened = false
        }
        ui.end()

        if (keep || input.pressed('Escape')) {
          confirming = false
          playSound('deny')
          return null
        }
        if (wipe) {
          playSound('select')
          return { kind: 'newGame' }
        }
        return null
      }

      const before = ui.focusedId()
      if (input.pressed('ArrowUp') || input.pressed('KeyW')) ui.focusNext(-1)
      if (input.pressed('ArrowDown') || input.pressed('KeyS')) ui.focusNext(1)
      if (ui.focusedId() !== before) playSound('select')

      const cont = ui.button('title.continue', 'CONTINUE', BUTTON_X, BUTTON_Y, BUTTON_W, BUTTON_H, {
        disabled: !ctx.hasSave,
      })
      const fresh = ui.button(
        'title.new',
        'NEW FARM',
        BUTTON_X,
        BUTTON_Y + BUTTON_PITCH,
        BUTTON_W,
        BUTTON_H,
      )
      const controls = ui.button(
        'title.controls',
        'CONTROLS',
        BUTTON_X,
        BUTTON_Y + BUTTON_PITCH * 2,
        BUTTON_W,
        BUTTON_H,
      )
      const quit = ui.button(
        'title.quit',
        'QUIT',
        BUTTON_X,
        BUTTON_Y + BUTTON_PITCH * 3,
        BUTTON_W,
        BUTTON_H,
      )
      ui.end()

      if (!ctx.hasSave) {
        drawText(g, 'NO FARM SAVED YET', BUTTON_X + BUTTON_W + 16, BUTTON_Y + 11, PAL.parchment, {
          shadow: PAL.ink,
        })
      }
      drawTextCentered(g, 'ARROWS CHOOSE - ENTER PICKS', LOGICAL_W / 2, LOGICAL_H - 40, PAL.parchment, {
        shadow: PAL.ink,
      })

      if (cont) {
        playSound('select')
        return { kind: 'loadGame' }
      }
      if (fresh) {
        if (ctx.hasSave) {
          confirming = true
          confirmOpened = true
          playSound('select')
          return null
        }
        playSound('select')
        return { kind: 'newGame' }
      }
      if (controls) {
        playSound('select')
        return { kind: 'push', scene: createHelpScene() }
      }
      if (quit) return { kind: 'quit' }
      return null
    },
  }
}
