import type { Scene, SceneCommand, SceneContext } from '../scene'
import { LOGICAL_H, LOGICAL_W, WORLD_Y } from '../../game/constants'
import { PAL } from '../../engine/palette'
import { drawText, drawTextCentered, textWidth } from '../../engine/font'
import { hline, outline, rect } from '../../engine/pixel'
import { mixHex } from '../../art/tiles'

/** The control table of docs/ARCHITECTURE.md, verbatim in intent if not in wording. */
const CONTROLS: ReadonlyArray<readonly [string, string]> = [
  ['ARROWS / WASD', 'WALK, AND FACE THAT WAY'],
  ['SPACE / ENTER', 'USE THE HELD TOOL AHEAD'],
  ['1 - 7', 'PICK A TOOL FROM THE BELT'],
  ['Q / E', 'CYCLE THE SELECTED SEED'],
  ['B', 'OPEN THE SHOP'],
  ['I', 'OPEN THE BAG'],
  ['N', 'SLEEP UNTIL MORNING'],
  ['H / F1', 'THIS PAGE'],
  ['M', 'MUTE THE SOUND'],
  ['ESC', 'CLOSE THE TOP PANEL'],
]

const PANEL_X = 16
const PANEL_Y = WORLD_Y + 2
const PANEL_W = LOGICAL_W - PANEL_X * 2
const PANEL_H = 174

const ROW_Y = PANEL_Y + 26
const ROW_H = 12
const KEY_X = PANEL_X + 8
const DESC_X = PANEL_X + 108

const NOTE = mixHex(PAL.ink, PAL.parchment, 0.42)

/** A carved key cap: ink outline, lantern face, ink legend. */
function keycap(ctx: CanvasRenderingContext2D, label: string, x: number, y: number): void {
  const w = textWidth(label) + 6
  const h = 11
  rect(ctx, x, y, w, h, PAL.lantern)
  hline(ctx, x + 1, y + 1, w - 2, mixHex(PAL.lantern, PAL.cream, 0.5))
  hline(ctx, x + 1, y + h - 2, w - 2, mixHex(PAL.lantern, PAL.bark, 0.4))
  outline(ctx, x, y, w, h, PAL.ink)
  drawText(ctx, label, x + 3, y + 2, PAL.ink)
}

export function createHelpScene(): Scene {
  return {
    id: 'help',

    update(ctx: SceneContext, input, ui, dt, frame): SceneCommand | null {
      ctx.tick(dt, frame)
      const g = ctx.g

      ui.begin(g, input)
      ui.panel(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 'CONTROLS')

      drawTextCentered(g, 'EVERY ACTION IS ON THE KEYBOARD', PANEL_X + PANEL_W / 2, PANEL_Y + 16, NOTE)

      for (let i = 0; i < CONTROLS.length; i++) {
        const [key, desc] = CONTROLS[i]
        const y = ROW_Y + i * ROW_H
        if (i % 2 === 1) {
          rect(g, PANEL_X + 5, y - 1, PANEL_W - 10, ROW_H - 1, mixHex(PAL.parchment, PAL.soil, 0.1))
        }
        keycap(g, key, KEY_X, y)
        drawText(g, desc, DESC_X, y + 2, PAL.ink, { maxWidth: PANEL_X + PANEL_W - 8 - DESC_X })
      }

      const footY = ROW_Y + CONTROLS.length * ROW_H + 3
      hline(g, PANEL_X + 6, footY, PANEL_W - 12, PAL.bark)
      drawTextCentered(g, 'ESC OR H CLOSES THIS PAGE', PANEL_X + PANEL_W / 2, footY + 5, NOTE)

      ui.end()

      ctx.toastY = LOGICAL_H - 6

      if (input.pressed('Escape') || input.pressed('KeyH') || input.pressed('F1')) {
        return { kind: 'pop' }
      }
      return null
    },
  }
}
