/**
 * The controls page, at 640x448.
 *
 * Every row is a carved key cap and a sentence, because a control list that reads as
 * a table of codes is a control list nobody reads. The extra room the doubled
 * framebuffer bought goes on the 7x9 body face, a taller cap and a real footer that
 * explains placement mode rather than leaving the player to find it.
 */
import type { Scene, SceneCommand, SceneContext } from '../scene'
import { LOGICAL_H, LOGICAL_W, WORLD_Y } from '../../game/constants'
import { PAL } from '../../engine/palette'
import { FONT_H, drawText, drawTextCentered, textWidth, wrapText } from '../../engine/font'
import { hline, outline, rect, woodPanel } from '../../engine/pixel'
import { mixHex } from '../../art/tiles'

/** The control table of docs/ARCHITECTURE.md, verbatim in intent if not in wording. */
const CONTROLS: ReadonlyArray<readonly [string, string]> = [
  ['ARROWS / WASD', 'WALK, AND FACE THAT WAY'],
  ['SPACE / ENTER', 'USE THE HELD TOOL AHEAD'],
  ['1 - 7', 'PICK A TOOL FROM THE BELT'],
  ['Q / E', 'CYCLE THE SELECTED SEED'],
  ['B', 'OPEN THE SHOP AND THE BUILD LIST'],
  ['I', 'OPEN THE BAG'],
  ['N', 'SLEEP UNTIL MORNING'],
  ['H / F1', 'THIS PAGE'],
  ['M', 'MUTE THE SOUND'],
  ['ESC', 'CLOSE THE TOP PANEL'],
]

const FOOTNOTE =
  'BUY A BUILDING OR A MACHINE AND THE FARM ENTERS PLACING MODE: THE ARROWS OR ' +
  'THE MOUSE MOVE THE FOOTPRINT, ENTER SETS IT DOWN AND ESC WALKS AWAY WITHOUT ' +
  'SPENDING A COIN. ESC OR H ALSO CLOSES THIS PAGE.'

const PANEL_X = 48
const PANEL_Y = WORLD_Y + 8
const PANEL_W = LOGICAL_W - PANEL_X * 2
const PANEL_H = 340

/** Panel interior, inside the 6 px wood frame and its 2 px ink outline. */
const INNER_X = PANEL_X + 16
const INNER_W = PANEL_W - 32

const ROW_Y = PANEL_Y + 66
const ROW_H = 20
const KEY_X = INNER_X
const DESC_X = PANEL_X + 148

const CAP_H = 18
const NOTE = mixHex(PAL.ink, PAL.parchment, 0.42)
const STRIPE = mixHex(PAL.parchment, PAL.soil, 0.1)

/**
 * A carved key cap: ink outline, lantern face, a lit top edge and a shaded bottom one,
 * ink legend. Light from the upper left, so the cap reads as a physical thing.
 */
function keycap(ctx: CanvasRenderingContext2D, label: string, x: number, y: number): void {
  const w = textWidth(label) + 10
  rect(ctx, x, y, w, CAP_H, PAL.lantern)
  rect(ctx, x + 1, y + 1, w - 2, 2, mixHex(PAL.lantern, PAL.cream, 0.55))
  rect(ctx, x + 1, y + 1, 2, CAP_H - 2, mixHex(PAL.lantern, PAL.cream, 0.35))
  rect(ctx, x + 1, y + CAP_H - 3, w - 2, 2, mixHex(PAL.lantern, PAL.bark, 0.45))
  rect(ctx, x + w - 3, y + 3, 2, CAP_H - 5, mixHex(PAL.lantern, PAL.bark, 0.3))
  outline(ctx, x, y, w, CAP_H, PAL.ink)
  drawText(ctx, label, x + 5, y + 4, PAL.ink)
}

export function createHelpScene(): Scene {
  const footLines = wrapText(FOOTNOTE, INNER_W)

  return {
    id: 'help',

    update(ctx: SceneContext, input, _ui, dt, frame): SceneCommand | null {
      ctx.tick(dt, frame)
      const g = ctx.g

      woodPanel(g, PANEL_X, PANEL_Y, PANEL_W, PANEL_H)
      drawTextCentered(g, 'CONTROLS', PANEL_X + PANEL_W / 2, PANEL_Y + 14, PAL.ink)
      hline(g, INNER_X, PANEL_Y + 30, INNER_W, PAL.bark)
      drawTextCentered(
        g,
        'EVERY ACTION IS ON THE KEYBOARD. THE MOUSE IS OPTIONAL.',
        PANEL_X + PANEL_W / 2,
        PANEL_Y + 44,
        NOTE,
      )

      for (let i = 0; i < CONTROLS.length; i++) {
        const [key, desc] = CONTROLS[i]
        const y = ROW_Y + i * ROW_H
        if (i % 2 === 1) rect(g, INNER_X - 6, y - 1, INNER_W + 12, ROW_H, STRIPE)
        keycap(g, key, KEY_X, y)
        drawText(g, desc, DESC_X, y + 4, PAL.ink, {
          maxWidth: PANEL_X + PANEL_W - 16 - DESC_X,
        })
      }

      let footY = ROW_Y + CONTROLS.length * ROW_H + 8
      hline(g, INNER_X, footY, INNER_W, PAL.bark)
      footY += 8
      for (const line of footLines) {
        drawText(g, line, INNER_X, footY, NOTE, { maxWidth: INNER_W })
        footY += FONT_H + 3
      }

      ctx.toastY = LOGICAL_H - 12

      if (input.pressed('Escape') || input.pressed('KeyH') || input.pressed('F1')) {
        return { kind: 'pop' }
      }
      return null
    },
  }
}
