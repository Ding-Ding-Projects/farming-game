/**
 * The bag, at 640x448.
 *
 * A ten-by-six grid of 40 px pockets — sixty visible lots against the old thirty-two,
 * which is what the doubled framebuffer buys. The 24 px item icons the art lanes draw
 * sit inside a pocket with room around them instead of filling it edge to edge, and
 * every pocket is drawn whether it holds anything or not, so a bag with room left
 * still looks made.
 */
import type { InventoryEntry, ItemRef } from '../../game/types'
import type { PointerState } from '../../engine/input'
import type { Scene, SceneCommand, SceneContext } from '../scene'
import { LOGICAL_H, LOGICAL_W, WORLD_Y } from '../../game/constants'
import { itemName } from '../../game/state'
import { selectSeed, setTool } from '../../game/actions'
import { cropById } from '../../game/crops'
import { productById } from '../../game/products'
import { treeById } from '../../game/trees'
import { sellValue } from '../../game/shop'
import { PAL } from '../../engine/palette'
import { drawText, drawTextCentered, textWidth } from '../../engine/font'
import { dither, hline, outline, rect, woodPanel } from '../../engine/pixel'
import { BUTTON_INSET } from '../../engine/ui'
import { playSound } from '../../engine/audio'
import { mixHex } from '../../art/tiles'
import { drawSeedIcon, drawProduceIcon } from '../../art/plants'
import { drawGoodIcon } from '../../art/actors'
import { ICON, drawMaterialIcon, drawProductIcon } from '../../art/goods'

const PANEL_X = 64
const PANEL_Y = WORLD_Y + 8
const PANEL_W = LOGICAL_W - PANEL_X * 2
const PANEL_H = 344

/** Inside the 6 px wood frame and its 2 px ink outline. */
const INNER_X = PANEL_X + 16
const INNER_W = PANEL_W - 32

const COLS = 10
const ROWS = 6
const CELL = 40
/** The art lanes draw every loose item at `ICON` px, centred in the pocket. */
const ICON_OFF = (CELL - ICON) >> 1

const GRID_X = PANEL_X + Math.floor((PANEL_W - COLS * CELL) / 2)
const GRID_Y = PANEL_Y + 48

const DETAIL_Y = PANEL_Y + PANEL_H - 42
const QUIET = mixHex(PAL.ink, PAL.parchment, 0.4)
const RECESS = mixHex(PAL.parchment, PAL.soil, 0.45)
const POCKET_EDGE = mixHex(PAL.parchment, PAL.ink, 0.2)

const CLOSE_W = 76
const CLOSE_H = 28
const CLOSE_X = PANEL_X + PANEL_W - CLOSE_W - 16
const CLOSE_Y = PANEL_Y + PANEL_H - CLOSE_H - 14

function inside(p: PointerState, x: number, y: number, w: number, h: number): boolean {
  return p.x >= x && p.x < x + w && p.y >= y && p.y < y + h
}

function drawIcon(ctx: CanvasRenderingContext2D, item: ItemRef, x: number, y: number): void {
  if (item.kind === 'good') {
    drawGoodIcon(ctx, item.goodId, x, y)
    return
  }
  if (item.kind === 'material') {
    drawMaterialIcon(ctx, item.materialId, x, y)
    return
  }
  if (item.kind === 'product') {
    const product = productById(item.productId)
    if (product === undefined) outline(ctx, x + 6, y + 6, 12, 12, PAL.dusk)
    else drawProductIcon(ctx, product, item.quality, x, y)
    return
  }
  // Fruit trees share the seed and produce variants with the crops, so both catalogues
  // are asked before the icon falls back to an empty box.
  const crop = cropById(item.cropId) ?? treeById(item.cropId)
  if (crop === undefined) {
    outline(ctx, x + 6, y + 6, 12, 12, PAL.dusk)
    return
  }
  if (item.kind === 'seed') drawSeedIcon(ctx, crop, x, y)
  else drawProduceIcon(ctx, crop, item.quality, x, y)
}

function detailNote(item: ItemRef, count: number): string {
  switch (item.kind) {
    case 'seed': {
      const crop = cropById(item.cropId) ?? treeById(item.cropId)
      const seasons = crop === undefined ? '' : crop.seasons.join('/').toUpperCase()
      return `${seasons} SEED - ENTER LOADS IT`
    }
    case 'produce':
    case 'product': {
      const unit = sellValue(item)
      if (unit <= 0) return `${count} IN THE BAG`
      return `${unit}G EACH - ${unit * count}G THE LOT`
    }
    case 'good':
      return item.goodId === 'sprinkler'
        ? 'ENTER HOLDS IT FOR PLACING'
        : 'ENTER HOLDS IT FOR SPREADING'
    case 'material':
      return `${count} IN STOCK - BUILDING AND EXTENDING SPENDS IT`
  }
}

/** One empty pocket: a dithered recess with a lit upper-left lip, light from up-left. */
function pocket(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  dither(ctx, x + 3, y + 3, CELL - 6, CELL - 6, RECESS, 0, 2)
  outline(ctx, x + 2, y + 2, CELL - 4, CELL - 4, POCKET_EDGE)
  hline(ctx, x + 3, y + 3, CELL - 6, mixHex(PAL.parchment, PAL.cream, 0.6))
}

export function createInventoryScene(): Scene {
  let selected = 0
  let scroll = 0

  const keepInView = (count: number): void => {
    if (selected >= count) selected = Math.max(0, count - 1)
    if (selected < 0) selected = 0
    const row = Math.floor(selected / COLS)
    if (row < scroll) scroll = row
    if (row >= scroll + ROWS) scroll = row - ROWS + 1
    const maxScroll = Math.max(0, Math.ceil(count / COLS) - ROWS)
    if (scroll > maxScroll) scroll = maxScroll
    if (scroll < 0) scroll = 0
  }

  return {
    id: 'inventory',

    update(ctx: SceneContext, input, _ui, dt, frame): SceneCommand | null {
      ctx.tick(dt, frame)
      const g = ctx.g
      const entries: InventoryEntry[] = ctx.state.inventory
      const count = entries.length
      keepInView(count)

      // ---- input -------------------------------------------------------
      const move = (delta: number): void => {
        if (count === 0) return
        const next = selected + delta
        if (next < 0 || next >= count) return
        selected = next
        keepInView(count)
        playSound('select')
      }
      if (input.repeated('ArrowLeft') || input.repeated('KeyA')) move(-1)
      if (input.repeated('ArrowRight') || input.repeated('KeyD')) move(1)
      if (input.repeated('ArrowUp') || input.repeated('KeyW')) move(-COLS)
      if (input.repeated('ArrowDown') || input.repeated('KeyS')) move(COLS)

      let take = input.pressed('Enter') || input.pressed('NumpadEnter') || input.pressed('Space')

      const p = input.pointer
      if (p.pressed) {
        if (inside(p, CLOSE_X, CLOSE_Y, CLOSE_W, CLOSE_H)) return { kind: 'pop' }
        for (let i = 0; i < count; i++) {
          const row = Math.floor(i / COLS) - scroll
          if (row < 0 || row >= ROWS) continue
          const cx = GRID_X + (i % COLS) * CELL
          const cy = GRID_Y + row * CELL
          if (!inside(p, cx, cy, CELL, CELL)) continue
          if (selected === i) take = true
          else {
            selected = i
            playSound('select')
          }
          break
        }
      }

      // ---- panel -------------------------------------------------------
      woodPanel(g, PANEL_X, PANEL_Y, PANEL_W, PANEL_H)
      drawTextCentered(g, 'THE BAG', PANEL_X + PANEL_W / 2, PANEL_Y + 14, PAL.ink)
      hline(g, INNER_X, PANEL_Y + 32, INNER_W, PAL.bark)

      // Empty pockets are drawn too: a bag with room left still looks made.
      for (let slot = 0; slot < COLS * ROWS; slot++) {
        pocket(g, GRID_X + (slot % COLS) * CELL, GRID_Y + Math.floor(slot / COLS) * CELL)
      }

      for (let i = 0; i < count; i++) {
        const row = Math.floor(i / COLS) - scroll
        if (row < 0 || row >= ROWS) continue
        const cx = GRID_X + (i % COLS) * CELL
        const cy = GRID_Y + row * CELL
        const entry = entries[i]
        const chosen = i === selected
        const hovered = inside(p, cx, cy, CELL, CELL)

        pocket(g, cx, cy)
        if (chosen) rect(g, cx + 3, cy + 3, CELL - 6, CELL - 6, PAL.lantern)
        else if (hovered) dither(g, cx + 3, cy + 3, CELL - 6, CELL - 6, PAL.lantern, 1, 2)
        outline(g, cx + 2, cy + 2, CELL - 4, CELL - 4, chosen ? PAL.ink : POCKET_EDGE)
        if (chosen) {
          outline(g, cx, cy, CELL, CELL, PAL.cream)
          outline(g, cx + 1, cy + 1, CELL - 2, CELL - 2, PAL.cream)
        }

        drawIcon(g, entry.item, cx + ICON_OFF, cy + ICON_OFF - 3)

        const label = `${entry.count}`
        drawText(g, label, cx + CELL - 6 - textWidth(label, 1, true), cy + CELL - 12, PAL.ink, {
          small: true,
          shadow: PAL.cream,
        })
      }

      if (count === 0) {
        drawTextCentered(
          g,
          'THE BAG IS EMPTY.',
          PANEL_X + PANEL_W / 2,
          GRID_Y + CELL * 2,
          QUIET,
        )
      }

      const rowsTotal = Math.ceil(count / COLS)
      if (rowsTotal > ROWS) {
        const tag = `ROW ${scroll + 1}-${Math.min(rowsTotal, scroll + ROWS)} OF ${rowsTotal}`
        drawText(g, tag, PANEL_X + PANEL_W - 16 - textWidth(tag), PANEL_Y + 14, QUIET)
      }
      drawText(g, `${count} LOTS`, INNER_X, PANEL_Y + 14, QUIET)

      // ---- detail ------------------------------------------------------
      hline(g, INNER_X, DETAIL_Y - 8, INNER_W, PAL.bark)
      if (count > 0) {
        const entry = entries[selected]
        drawText(g, `${itemName(entry.item)} X${entry.count}`, INNER_X, DETAIL_Y, PAL.ink, {
          maxWidth: CLOSE_X - 16 - INNER_X,
        })
        drawText(g, detailNote(entry.item, entry.count), INNER_X, DETAIL_Y + 16, QUIET, {
          maxWidth: CLOSE_X - 16 - INNER_X,
        })
      } else {
        drawText(g, 'SOW SOMETHING AND COME BACK.', INNER_X, DETAIL_Y, QUIET)
      }

      woodPanel(g, CLOSE_X, CLOSE_Y, CLOSE_W, CLOSE_H, { thin: true })
      if (inside(p, CLOSE_X, CLOSE_Y, CLOSE_W, CLOSE_H)) {
        rect(
          g,
          CLOSE_X + BUTTON_INSET,
          CLOSE_Y + BUTTON_INSET,
          CLOSE_W - BUTTON_INSET * 2,
          CLOSE_H - BUTTON_INSET * 2,
          PAL.lantern,
        )
      }
      drawTextCentered(g, 'ESC', CLOSE_X + CLOSE_W / 2, CLOSE_Y + 10, PAL.ink)

      ctx.toastY = LOGICAL_H - 8

      // ---- act ---------------------------------------------------------
      if (take && count > 0) {
        const item = entries[selected].item
        if (item.kind === 'seed') {
          ctx.state = setTool(selectSeed(ctx.state, item.cropId), 'seeds')
          playSound('select')
          ctx.say(`${itemName(item)} LOADED. SOW WITH SPACE.`, 'good')
          return { kind: 'pop' }
        }
        if (item.kind === 'good') {
          ctx.state = setTool(ctx.state, item.goodId)
          playSound('select')
          ctx.say(`HOLDING THE ${itemName(item)}.`, 'good')
          return { kind: 'pop' }
        }
        playSound('deny')
        ctx.say(
          item.kind === 'material'
            ? 'MATERIALS ARE SPENT ON BUILDING, NOT CARRIED.'
            : 'PRODUCE AND GOODS SELL AT THE SHOP - PRESS B.',
          'info',
        )
      }

      if (input.pressed('Escape') || input.pressed('KeyI')) return { kind: 'pop' }
      return null
    },
  }
}
