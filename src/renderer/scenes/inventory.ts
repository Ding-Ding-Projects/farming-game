import type { InventoryEntry, ItemRef } from '../../game/types'
import type { PointerState } from '../../engine/input'
import type { Scene, SceneCommand, SceneContext } from '../scene'
import { LOGICAL_W, WORLD_Y } from '../../game/constants'
import { itemName } from '../../game/state'
import { selectSeed, setTool } from '../../game/actions'
import { cropById } from '../../game/crops'
import { sellValue } from '../../game/shop'
import { PAL } from '../../engine/palette'
import { drawText, drawTextCentered, textWidth } from '../../engine/font'
import { dither, hline, outline, rect, woodPanel } from '../../engine/pixel'
import { playSound } from '../../engine/audio'
import { mixHex } from '../../art/tiles'
import { drawSeedIcon, drawProduceIcon } from '../../art/plants'
import { drawGoodIcon } from '../../art/actors'

const PANEL_X = 32
const PANEL_Y = WORLD_Y + 4
const PANEL_W = LOGICAL_W - PANEL_X * 2
const PANEL_H = 164

const COLS = 8
const ROWS = 4
const CELL = 26
const GRID_X = PANEL_X + Math.floor((PANEL_W - COLS * CELL) / 2)
const GRID_Y = PANEL_Y + 20

const DETAIL_Y = PANEL_Y + PANEL_H - 30
const QUIET = mixHex(PAL.ink, PAL.parchment, 0.4)
const RECESS = mixHex(PAL.parchment, PAL.soil, 0.45)

const CLOSE_W = 44
const CLOSE_H = 13
const CLOSE_X = PANEL_X + PANEL_W - CLOSE_W - 6
const CLOSE_Y = PANEL_Y + PANEL_H - CLOSE_H - 6

function inside(p: PointerState, x: number, y: number, w: number, h: number): boolean {
  return p.x >= x && p.x < x + w && p.y >= y && p.y < y + h
}

function drawIcon(
  ctx: CanvasRenderingContext2D,
  item: ItemRef,
  x: number,
  y: number,
): void {
  if (item.kind === 'good') {
    drawGoodIcon(ctx, item.goodId, x, y)
    return
  }
  const crop = cropById(item.cropId)
  if (crop === undefined) {
    outline(ctx, x + 2, y + 2, 8, 8, PAL.dusk)
    return
  }
  if (item.kind === 'seed') drawSeedIcon(ctx, crop, x, y)
  else drawProduceIcon(ctx, crop, item.quality, x, y)
}

function detailNote(item: ItemRef, count: number): string {
  switch (item.kind) {
    case 'seed': {
      const crop = cropById(item.cropId)
      const seasons = crop === undefined ? '' : crop.seasons.join('/').toUpperCase()
      return `${seasons} SEED - ENTER LOADS IT`
    }
    case 'produce': {
      const unit = sellValue(item)
      return `${unit}G EACH - ${unit * count}G THE LOT`
    }
    case 'good':
      return item.goodId === 'sprinkler'
        ? 'ENTER HOLDS IT FOR PLACING'
        : 'ENTER HOLDS IT FOR SPREADING'
  }
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
      drawTextCentered(g, 'THE BAG', PANEL_X + PANEL_W / 2, PANEL_Y + 6, PAL.ink)
      hline(g, PANEL_X + 6, PANEL_Y + 15, PANEL_W - 12, PAL.bark)

      // Empty pockets are drawn too: a bag with room left still looks made.
      for (let slot = 0; slot < COLS * ROWS; slot++) {
        const cx = GRID_X + (slot % COLS) * CELL
        const cy = GRID_Y + Math.floor(slot / COLS) * CELL
        dither(g, cx + 2, cy + 2, CELL - 4, CELL - 4, RECESS)
        outline(g, cx + 1, cy + 1, CELL - 2, CELL - 2, mixHex(PAL.parchment, PAL.ink, 0.2))
      }

      for (let i = 0; i < count; i++) {
        const row = Math.floor(i / COLS) - scroll
        if (row < 0 || row >= ROWS) continue
        const cx = GRID_X + (i % COLS) * CELL
        const cy = GRID_Y + row * CELL
        const entry = entries[i]
        const chosen = i === selected
        const hovered = inside(p, cx, cy, CELL, CELL)

        dither(g, cx + 2, cy + 2, CELL - 4, CELL - 4, RECESS)
        if (chosen) rect(g, cx + 2, cy + 2, CELL - 4, CELL - 4, PAL.lantern)
        else if (hovered) dither(g, cx + 2, cy + 2, CELL - 4, CELL - 4, PAL.lantern, 1)
        outline(g, cx + 1, cy + 1, CELL - 2, CELL - 2, chosen ? PAL.ink : mixHex(PAL.parchment, PAL.ink, 0.35))
        if (chosen) outline(g, cx, cy, CELL, CELL, PAL.cream)

        drawIcon(g, entry.item, cx + 7, cy + 5)

        const label = `${entry.count}`
        drawText(g, label, cx + CELL - 4 - textWidth(label), cy + CELL - 11, PAL.ink, {
          shadow: PAL.cream,
        })
      }

      if (count === 0) {
        drawTextCentered(
          g,
          'THE BAG IS EMPTY.',
          PANEL_X + PANEL_W / 2,
          GRID_Y + CELL,
          QUIET,
        )
      }

      const rowsTotal = Math.ceil(count / COLS)
      if (rowsTotal > ROWS) {
        const tag = `ROW ${scroll + 1}-${Math.min(rowsTotal, scroll + ROWS)} OF ${rowsTotal}`
        drawText(g, tag, PANEL_X + PANEL_W - 8 - textWidth(tag), PANEL_Y + 6, QUIET)
      }

      // ---- detail ------------------------------------------------------
      hline(g, PANEL_X + 6, DETAIL_Y - 4, PANEL_W - 12, PAL.bark)
      if (count > 0) {
        const entry = entries[selected]
        drawText(g, `${itemName(entry.item)} X${entry.count}`, PANEL_X + 8, DETAIL_Y, PAL.ink, {
          maxWidth: PANEL_W - 16,
        })
        drawText(g, detailNote(entry.item, entry.count), PANEL_X + 8, DETAIL_Y + 10, QUIET, {
          maxWidth: PANEL_W - 16 - CLOSE_W,
        })
      } else {
        drawText(g, 'SOW SOMETHING AND COME BACK.', PANEL_X + 8, DETAIL_Y, QUIET)
      }

      woodPanel(g, CLOSE_X, CLOSE_Y, CLOSE_W, CLOSE_H, { thin: true })
      if (inside(p, CLOSE_X, CLOSE_Y, CLOSE_W, CLOSE_H)) {
        rect(g, CLOSE_X + 2, CLOSE_Y + 2, CLOSE_W - 4, CLOSE_H - 4, PAL.lantern)
      }
      drawTextCentered(g, 'ESC', CLOSE_X + CLOSE_W / 2, CLOSE_Y + 3, PAL.ink)

      ctx.toastY = PANEL_Y + PANEL_H + 26

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
        ctx.say('PRODUCE SELLS AT THE SHOP - PRESS B.', 'info')
      }

      if (input.pressed('Escape') || input.pressed('KeyI')) return { kind: 'pop' }
      return null
    },
  }
}
