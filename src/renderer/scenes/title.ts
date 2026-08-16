import type { Scene, SceneCommand, SceneContext } from '../scene'
import { LOGICAL_H, LOGICAL_W } from '../../game/constants'
import { PAL, shade, withAlpha } from '../../engine/palette'
import { drawText, drawTextCentered, textWidth } from '../../engine/font'
import { hline, px, rect, woodPanel } from '../../engine/pixel'
import { playSound, unlockAudio } from '../../engine/audio'
import { artNoise, mixHex } from '../../art/tiles'
import { drawFencePost, drawTree } from '../../art/scenery'
import { createHelpScene } from './help'

const HORIZON = 128
const FAR_RIDGE = 118
const MID_RIDGE = 142
const NEAR_RIDGE = 168

const SKY_TOP = mixHex(PAL.dusk, PAL.sky, 0.5)
const SKY_LOW = mixHex(PAL.lantern, PAL.parchment, 0.45)
const FAR_HILL = mixHex(PAL.dusk, PAL.shadow, 0.45)
const MID_HILL = shade(PAL.leaf, -0.35)
const NEAR_HILL = shade(PAL.grass, -0.5)

const BUTTON_W = 116
const BUTTON_X = Math.floor((LOGICAL_W - BUTTON_W) / 2)
const BUTTON_H = 16
const BUTTON_Y = 104
const BUTTON_PITCH = 22

/** A ridge line that wanders, so no hill reads as a rectangle. */
function ridge(x: number, base: number, seed: number): number {
  const wobble =
    3.2 * Math.sin(x * 0.041 + seed) +
    1.8 * Math.sin(x * 0.113 + seed * 2.1) +
    1.1 * Math.sin(x * 0.007 + seed * 0.6)
  return Math.round(base + wobble)
}

function hill(ctx: CanvasRenderingContext2D, base: number, seed: number, color: string): void {
  const lit = mixHex(color, PAL.cream, 0.16)
  for (let x = 0; x < LOGICAL_W; x++) {
    const top = ridge(x, base, seed)
    rect(ctx, x, top, 1, LOGICAL_H - top, color)
    px(ctx, x, top, lit)
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
  const sunX = 268
  const sunY = FAR_RIDGE - 7
  disc(ctx, sunX, sunY, 17, withAlpha(PAL.lantern, 0.1))
  disc(ctx, sunX, sunY, 12, withAlpha(PAL.lantern, 0.14))
  disc(ctx, sunX, sunY, 8, mixHex(PAL.lantern, PAL.cream, 0.3))
  disc(ctx, sunX, sunY - 1, 4, mixHex(PAL.lantern, PAL.cream, 0.7))

  for (let i = 0; i < 7; i++) {
    const cx = Math.floor(artNoise(i, 3) * LOGICAL_W)
    const cy = 14 + Math.floor(artNoise(i, 4) * 70)
    const w = 18 + Math.floor(artNoise(i, 5) * 34)
    rect(ctx, cx, cy, w, 1, withAlpha(PAL.cream, 0.2))
    rect(ctx, cx + 4, cy + 1, Math.max(6, w - 10), 1, withAlpha(PAL.cream, 0.12))
  }
}

function valley(ctx: CanvasRenderingContext2D): void {
  sky(ctx)
  hill(ctx, FAR_RIDGE, 0.4, FAR_HILL)

  // The treeline stands on the middle ridge, before the near hill buries its roots.
  // Drawn at 2x: every tree pixel becomes a 2x2 block, so the wood keeps its scale.
  for (let i = 0; i < 10; i++) {
    const x = -14 + i * 36 + Math.floor(artNoise(i, 21) * 13)
    ctx.save()
    ctx.translate(x, ridge(x + 16, MID_RIDGE, 1.1) - 27)
    ctx.scale(2, 2)
    drawTree(ctx, 0, 0, artNoise(i, 22) > 0.7 ? 'fall' : 'summer', i)
    ctx.restore()
  }
  hill(ctx, MID_RIDGE, 1.1, MID_HILL)
  hill(ctx, NEAR_RIDGE, 2.3, NEAR_HILL)

  // A fence line running along the near slope.
  for (let i = 0; i < 11; i++) {
    const x = -4 + i * 32
    const y = ridge(x + 8, NEAR_RIDGE, 2.3) + 2
    drawFencePost(ctx, x, y)
    hline(ctx, x + 11, y + 6, 22, mixHex(PAL.bark, PAL.ink, 0.2))
    hline(ctx, x + 11, y + 10, 22, mixHex(PAL.bark, PAL.ink, 0.35))
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
      ctx.toastY = LOGICAL_H - 6

      valley(g)

      bigText(g, 'SPROUT HOLLOW', LOGICAL_W / 2 + 3, 33, 3, withAlpha(PAL.ink, 0.55))
      bigText(g, 'SPROUT HOLLOW', LOGICAL_W / 2, 30, 3, PAL.cream)
      drawTextCentered(g, 'A QUIET FARM AT THE FOOT OF THE VALLEY', LOGICAL_W / 2, 60, PAL.parchment, {
        shadow: PAL.ink,
      })

      ui.begin(g, input)

      if (confirming) {
        const before = ui.focusedId()
        if (input.pressed('ArrowLeft') || input.pressed('KeyA')) ui.focusNext(-1)
        if (input.pressed('ArrowRight') || input.pressed('KeyD')) ui.focusNext(1)
        if (ui.focusedId() !== before) playSound('select')

        const px0 = 44
        const py0 = 92
        const pw = LOGICAL_W - px0 * 2
        woodPanel(g, px0, py0, pw, 74)
        drawTextCentered(g, 'START A NEW FARM?', px0 + pw / 2, py0 + 12, PAL.ink)
        drawTextCentered(g, 'THE FARM ALREADY IN THE VALLEY', px0 + pw / 2, py0 + 26, PAL.ink)
        drawTextCentered(g, 'WILL BE LOST FOR GOOD.', px0 + pw / 2, py0 + 36, PAL.berry)

        const keep = ui.button('title.keep', 'KEEP IT', px0 + 14, py0 + 50, 88, 15)
        const wipe = ui.button('title.wipe', 'START OVER', px0 + pw - 102, py0 + 50, 88, 15)
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
        drawText(g, 'NO FARM SAVED YET', BUTTON_X + BUTTON_W + 8, BUTTON_Y + 5, PAL.parchment, {
          shadow: PAL.ink,
        })
      }
      drawTextCentered(g, 'ARROWS CHOOSE - ENTER PICKS', LOGICAL_W / 2, 198, PAL.parchment, {
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
