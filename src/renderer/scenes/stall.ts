/**
 * The roadside stall's pricing panel, at 640x448.
 *
 * `game/interiors.ts` opens this with `{ open: 'price', ref: slotIndex }` when the player
 * walks up to one of the stall's counters, so `createStallScene` takes the slot to land on
 * as an optional argument — the same "one call, fully formed" shape every other scene push
 * uses (`createShopScene()`, `createInventoryScene()`), just with room for a caller that
 * already knows which counter was used. A caller with nothing to say still just calls
 * `createStallScene()` and lands on slot one.
 *
 * The six slots list along the top; the selected one's controls sit below it: which item,
 * how much of it, and the price — plus the three numbers `market.ts` publishes so a player
 * never has to take the clamp or the sell rate on faith. Every price and rate on screen is
 * read from `market.ts`'s own verbs; nothing here recomputes the curve.
 *
 * A price or quantity change previews live before it is committed: the steppers only touch
 * this scene's own local state, and `STOCK`/`UPDATE` is the one action that actually calls
 * `stockStall`. The live preview rate is `stallSellRate` itself, run against a throwaway
 * clone of the real state — the published formula, just not yet saved.
 */
import type { ActionResult, GameState, InventoryEntry, ItemRef } from '../../game/types'
import type { PointerState } from '../../engine/input'
import type { Scene, SceneCommand, SceneContext } from '../scene'
import { LOGICAL_H, LOGICAL_W, WORLD_Y } from '../../game/constants'
import { cloneState, countItem, itemKey, itemName } from '../../game/state'
import {
  clampStallPrice,
  closingPrice,
  stallPriceCeiling,
  stallPriceFloor,
  stallSellRate,
  stockStall,
  unstockStall,
} from '../../game/market'
import { cropById } from '../../game/crops'
import { productById } from '../../game/products'
import { treeById } from '../../game/trees'
import { PAL, withAlpha } from '../../engine/palette'
import { FONT_H, drawText, drawTextCentered, textWidth } from '../../engine/font'
import { dither, hline, outline, rect, woodPanel } from '../../engine/pixel'
import { BUTTON_INSET } from '../../engine/ui'
import { playSound } from '../../engine/audio'
import { mixHex } from '../../art/tiles'
import { drawProduceIcon, drawSeedIcon } from '../../art/plants'
import { drawGoodIcon } from '../../art/actors'
import { drawMaterialIcon, drawProductIcon } from '../../art/goods'

/* ------------------------------------------------------------------ layout */

const PANEL_X = 8
const PANEL_Y = WORLD_Y + 4
const PANEL_W = LOGICAL_W - PANEL_X * 2
const PANEL_H = 344

const INNER_X = PANEL_X + 16
const INNER_R = PANEL_X + PANEL_W - 16

const LIST_Y = PANEL_Y + 34
const SLOT_H = 22
const SLOT_ITEM_X = INNER_X + 60
const SLOT_PRICE_X = INNER_X + 300
const SLOT_RATE_X = INNER_X + 380

const ICON_SIZE = 24
const BTN_H = 22
const COMMIT_H = BTN_H + 4
const STEP_W = 34
const CYCLE_X = INNER_R - 150
const CYCLE_W = 150

/** Quantity steppers, left half of the controls row. */
const QTY_MINUS10_X = 24
const QTY_MINUS1_X = 62
const QTY_LABEL_X0 = 100
const QTY_LABEL_X1 = 204
const QTY_PLUS1_X = 208
const QTY_PLUS10_X = 246

/** Price steppers, right half of the controls row. */
const PRICE_MINUS10_X = 330
const PRICE_MINUS1_X = 368
const PRICE_LABEL_X0 = 406
const PRICE_LABEL_X1 = 530
const PRICE_PLUS1_X = 534
const PRICE_PLUS10_X = 572

const COMMIT_X = INNER_X
const COMMIT_W = 280
const TAKEBACK_X = 320
const TAKEBACK_W = 180

const CLOSE_W = 140
const CLOSE_H = 28
const CLOSE_X = INNER_R - CLOSE_W
const CLOSE_Y = PANEL_Y + PANEL_H - 16 - CLOSE_H

const QTY_STEP_BIG = 10
const PRICE_STEP_BIG = 10

const QUIET = mixHex(PAL.ink, PAL.parchment, 0.4)
const STRIPE = mixHex(PAL.parchment, PAL.soil, 0.1)

/* ------------------------------------------------------------------ widgets */

interface PlateState {
  hovered: boolean
  held: boolean
  disabled: boolean
  focused: boolean
}

function inside(p: PointerState, x: number, y: number, w: number, h: number): boolean {
  return p.x >= x && p.x < x + w && p.y >= y && p.y < y + h
}

/** Identical in construction to `shop.ts`'s `plate` — one carved wood button. */
function plate(
  g: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  s: PlateState,
): void {
  woodPanel(g, x, y, w, h, { thin: true })
  let fill = PAL.parchment
  if (s.held) fill = PAL.cream
  else if (s.hovered) fill = PAL.lantern
  const ix = x + BUTTON_INSET
  const iy = y + BUTTON_INSET
  const iw = w - BUTTON_INSET * 2
  const ih = h - BUTTON_INSET * 2
  if (fill !== PAL.parchment && iw > 0 && ih > 0) rect(g, ix, iy, iw, ih, fill)
  drawTextCentered(g, label, x + Math.floor(w / 2), y + Math.floor((h - FONT_H) / 2), PAL.ink)
  if (s.disabled && iw > 0 && ih > 0) dither(g, ix, iy, iw, ih, PAL.dusk, 0, 2)
  if (s.focused) {
    outline(g, x, y, w, h, PAL.cream)
    outline(g, x - 1, y - 1, w + 2, h + 2, withAlpha(PAL.ink, 0.5))
  }
}

function drawItemIcon(g: CanvasRenderingContext2D, item: ItemRef, x: number, y: number): void {
  switch (item.kind) {
    case 'good':
      drawGoodIcon(g, item.goodId, x, y)
      return
    case 'material':
      drawMaterialIcon(g, item.materialId, x, y)
      return
    case 'product': {
      const product = productById(item.productId)
      if (product !== undefined) drawProductIcon(g, product, item.quality, x, y)
      return
    }
    case 'seed': {
      const crop = cropById(item.cropId) ?? treeById(item.cropId)
      if (crop !== undefined) drawSeedIcon(g, crop, x, y)
      return
    }
    case 'produce': {
      const crop = cropById(item.cropId) ?? treeById(item.cropId)
      if (crop !== undefined) drawProduceIcon(g, crop, item.quality, x, y)
      return
    }
  }
}

/* ------------------------------------------------------------------ market reads */

/** Every carried stack that could go into this slot: the slot's own item if it holds
 * one, otherwise anything in the bag. `stockStall` itself refuses a mismatched item on
 * an occupied slot, so the candidate list mirrors that rule rather than fighting it. */
function candidatesFor(state: GameState, occupiedItem: ItemRef | null): InventoryEntry[] {
  if (occupiedItem !== null) {
    const key = itemKey(occupiedItem)
    return state.inventory.filter((e) => e.count > 0 && itemKey(e.item) === key)
  }
  return state.inventory.filter((e) => e.count > 0)
}

/**
 * The rate a price *would* sell at, without touching the save. `stallSellRate` is the
 * real published formula; this only ever hands it a scratch clone that is thrown away
 * the moment the number is read.
 */
function previewRate(state: GameState, slot: number, item: ItemRef, price: number): number {
  const clone = cloneState(state)
  const target = clone.stall[slot]
  if (target === undefined) return 0
  target.item = item
  target.count = Math.max(target.count, 1)
  target.price = price
  return stallSellRate(clone, slot)
}

/** The curve `market.ts` publishes, in the plain words the panel promises. */
function rateWord(rate: number): string {
  if (rate <= 0) return ''
  if (rate >= 0.45) return 'SELLS FAST'
  if (rate >= 0.18) return 'STEADY SALES'
  if (rate >= 0.06) return 'SLOW SALES'
  return 'WILL SIT'
}

/* ------------------------------------------------------------------ actions */

interface DetailAction {
  label: string
  x: number
  y: number
  w: number
  h: number
  disabled: boolean
  run(): SceneCommand | null
}

/**
 * The roadside stall's pricing panel.
 *
 * `focusSlot`, when given, is the counter the player just walked up to inside the stall's
 * interior — the panel opens with that slot already selected rather than always slot one.
 */
export function createStallScene(focusSlot?: number): Scene {
  let selected = focusSlot !== undefined && focusSlot >= 0 ? Math.floor(focusSlot) : 0
  let col = 0
  let pendingItemIdx = 0
  let pendingQty = 0
  let pendingPrice = 0
  let signature = ''
  let announced = ''

  return {
    id: 'stall',

    update(ctx: SceneContext, input, _ui, dt, frame): SceneCommand | null {
      ctx.tick(dt, frame)
      const g = ctx.g
      const state = ctx.state
      const p = input.pointer

      let result: ActionResult | null = null
      const take = (r: ActionResult): void => {
        result = r
      }

      // ---- which slot, and what it holds ---------------------------------
      const slots = state.stall
      const slotCount = slots.length
      if (selected >= slotCount) selected = Math.max(0, slotCount - 1)
      if (selected < 0) selected = 0
      const slot = slots[selected]
      const stalled = slot !== undefined && slot.item !== null && slot.count > 0
      const occupiedItem: ItemRef | null = stalled ? (slot as { item: ItemRef }).item : null
      const stalledCount = slot?.count ?? 0
      const stalledPrice = slot?.price ?? 0

      const candidates = candidatesFor(state, occupiedItem)
      if (pendingItemIdx >= candidates.length) pendingItemIdx = 0

      // A fresh slot, or a slot whose stocked item changed under us, gets a fresh guess
      // rather than yesterday's leftover numbers.
      const sig = `${selected}:${occupiedItem !== null ? itemKey(occupiedItem) : 'empty'}`
      if (sig !== signature) {
        signature = sig
        pendingItemIdx = 0
        col = 0
        const first = candidates[0]
        pendingQty = occupiedItem !== null ? 0 : (first?.count ?? 0)
        pendingPrice = occupiedItem !== null ? stalledPrice : first ? closingPrice(state, first.item) : 0
      }

      const candidateEntry = candidates[pendingItemIdx]
      const candidateItem: ItemRef | null = occupiedItem ?? candidateEntry?.item ?? null
      const maxQty = candidateEntry?.count ?? 0
      pendingQty = Math.max(0, Math.min(pendingQty, maxQty))

      const canCycle = occupiedItem === null && candidates.length > 1

      // ---- layout rows, known before any action needs them ---------------
      const dividerY = LIST_Y + slotCount * SLOT_H + 6
      const row1Y = dividerY + 12
      const row2Y = row1Y + 26
      const row3Y = row2Y + 26
      const row4Y = row3Y + 20

      // ---- detail actions --------------------------------------------------
      const actions: DetailAction[] = []
      if (canCycle) {
        actions.push({
          label: 'NEXT ITEM',
          x: CYCLE_X,
          y: row1Y,
          w: CYCLE_W,
          h: BTN_H,
          disabled: false,
          run: () => {
            pendingItemIdx = (pendingItemIdx + 1) % candidates.length
            const next = candidates[pendingItemIdx]
            pendingQty = next.count
            pendingPrice = closingPrice(state, next.item)
            playSound('select')
            return null
          },
        })
      }

      const stepQty =
        (delta: number): DetailAction['run'] =>
        () => {
          pendingQty = Math.max(0, Math.min(maxQty, pendingQty + delta))
          playSound('select')
          return null
        }
      const stepPrice =
        (delta: number): DetailAction['run'] =>
        () => {
          pendingPrice = Math.max(0, pendingPrice + delta)
          playSound('select')
          return null
        }

      const stepsDisabled = candidateItem === null
      actions.push(
        { label: `-${QTY_STEP_BIG}`, x: QTY_MINUS10_X, y: row2Y, w: STEP_W, h: BTN_H, disabled: stepsDisabled, run: stepQty(-QTY_STEP_BIG) },
        { label: '-1', x: QTY_MINUS1_X, y: row2Y, w: STEP_W, h: BTN_H, disabled: stepsDisabled, run: stepQty(-1) },
        { label: '+1', x: QTY_PLUS1_X, y: row2Y, w: STEP_W, h: BTN_H, disabled: stepsDisabled, run: stepQty(1) },
        { label: `+${QTY_STEP_BIG}`, x: QTY_PLUS10_X, y: row2Y, w: STEP_W, h: BTN_H, disabled: stepsDisabled, run: stepQty(QTY_STEP_BIG) },
        { label: `-${PRICE_STEP_BIG}`, x: PRICE_MINUS10_X, y: row2Y, w: STEP_W, h: BTN_H, disabled: stepsDisabled, run: stepPrice(-PRICE_STEP_BIG) },
        { label: '-1', x: PRICE_MINUS1_X, y: row2Y, w: STEP_W, h: BTN_H, disabled: stepsDisabled, run: stepPrice(-1) },
        { label: '+1', x: PRICE_PLUS1_X, y: row2Y, w: STEP_W, h: BTN_H, disabled: stepsDisabled, run: stepPrice(1) },
        { label: `+${PRICE_STEP_BIG}`, x: PRICE_PLUS10_X, y: row2Y, w: STEP_W, h: BTN_H, disabled: stepsDisabled, run: stepPrice(PRICE_STEP_BIG) },
        {
          label: occupiedItem !== null ? 'UPDATE' : 'STOCK',
          x: COMMIT_X,
          y: row4Y,
          w: COMMIT_W,
          h: COMMIT_H,
          disabled: candidateItem === null,
          run: () => {
            if (candidateItem === null) return null
            take(stockStall(state, selected, candidateItem, pendingQty, pendingPrice))
            return null
          },
        },
      )
      if (occupiedItem !== null) {
        actions.push({
          label: 'TAKE BACK',
          x: TAKEBACK_X,
          y: row4Y,
          w: TAKEBACK_W,
          h: COMMIT_H,
          disabled: false,
          run: () => {
            take(unstockStall(state, selected))
            return null
          },
        })
      }
      actions.push({
        label: 'CLOSE',
        x: CLOSE_X,
        y: CLOSE_Y,
        w: CLOSE_W,
        h: CLOSE_H,
        disabled: false,
        run: () => ({ kind: 'pop' }),
      })

      if (col >= actions.length) col = actions.length - 1
      if (col < 0) col = 0

      // ---- keyboard -------------------------------------------------------
      const moveSelected = (delta: number): void => {
        if (slotCount === 0) return
        const next = Math.max(0, Math.min(slotCount - 1, selected + delta))
        if (next === selected) return
        selected = next
        col = 0
        playSound('select')
      }
      const moveCol = (delta: number): void => {
        if (actions.length === 0) return
        const next = Math.max(0, Math.min(actions.length - 1, col + delta))
        if (next === col) return
        col = next
        playSound('select')
      }

      if (input.repeated('ArrowUp') || input.repeated('KeyW')) moveSelected(-1)
      if (input.repeated('ArrowDown') || input.repeated('KeyS')) moveSelected(1)
      if (input.repeated('ArrowLeft') || input.repeated('KeyA')) moveCol(-1)
      if (input.repeated('ArrowRight') || input.repeated('KeyD')) moveCol(1)
      const activate = input.pressed('Enter') || input.pressed('NumpadEnter') || input.pressed('Space')

      // ---- panel ------------------------------------------------------
      woodPanel(g, PANEL_X, PANEL_Y, PANEL_W, PANEL_H)
      drawTextCentered(g, 'ROADSIDE STALL', PANEL_X + PANEL_W / 2, PANEL_Y + 14, PAL.ink)
      const purse = `${state.gold}G`
      drawText(g, purse, INNER_R - textWidth(purse), PANEL_Y + 14, PAL.ink)
      hline(g, INNER_X, PANEL_Y + 30, INNER_R - INNER_X, PAL.bark)

      if (slotCount === 0) {
        drawTextCentered(g, 'THERE IS NO ROADSIDE STALL YET.', PANEL_X + PANEL_W / 2, LIST_Y + 40, QUIET)
      }

      // ---- slot list ----------------------------------------------------
      let fire: DetailAction | null = null

      for (let i = 0; i < slotCount; i++) {
        const s = slots[i]
        const has = s !== undefined && s.item !== null && s.count > 0
        const ry = LIST_Y + i * SLOT_H
        const rowHovered = inside(p, INNER_X - 8, ry, INNER_R - INNER_X + 16, SLOT_H)
        if (i % 2 === 1) rect(g, INNER_X - 8, ry, INNER_R - INNER_X + 16, SLOT_H - 1, STRIPE)
        if (i === selected) {
          rect(g, INNER_X - 8, ry, 3, SLOT_H - 1, PAL.lantern)
          rect(g, INNER_X - 8, ry, INNER_R - INNER_X + 16, SLOT_H - 1, withAlpha(PAL.lantern, 0.12))
        }
        if (rowHovered && p.pressed && selected !== i) {
          selected = i
          col = 0
          playSound('select')
        }

        drawText(g, `SLOT ${i + 1}`, INNER_X, ry + 4, QUIET)
        if (has && s !== undefined && s.item !== null) {
          drawText(g, `${itemName(s.item)} X${s.count}`, SLOT_ITEM_X, ry + 4, PAL.ink, {
            maxWidth: 236,
          })
          drawText(g, `${s.price}G`, SLOT_PRICE_X, ry + 4, PAL.ink)
          drawText(g, rateWord(stallSellRate(state, i)), SLOT_RATE_X, ry + 4, QUIET)
        } else {
          drawText(g, 'EMPTY', SLOT_ITEM_X, ry + 4, QUIET)
        }
      }

      if (slotCount > 0) {
        const label =
          stalled && slot?.item !== null && slot !== undefined
            ? `SLOT ${selected + 1} - ${itemName(slot.item as ItemRef)} X${stalledCount} AT ${stalledPrice}G`
            : `SLOT ${selected + 1} - EMPTY`
        if (announced !== label) {
          announced = label
          ctx.announce(announced)
        }
      }

      // ---- detail ---------------------------------------------------------
      hline(g, INNER_X, dividerY, INNER_R - INNER_X, PAL.bark)

      if (slotCount > 0) {
        if (candidateItem === null) {
          drawText(g, 'YOUR BAG IS EMPTY.', INNER_X, row1Y + 4, QUIET)
        } else {
          drawItemIcon(g, candidateItem, INNER_X, row1Y)
          const held = countItem(state, candidateItem)
          const summary =
            occupiedItem !== null
              ? `${itemName(candidateItem)} - ${stalledCount} ON THE STALL, ${held} MORE IN THE BAG`
              : `${itemName(candidateItem)} - ${held} IN THE BAG`
          drawText(g, summary, INNER_X + ICON_SIZE + 6, row1Y + 8, PAL.ink, {
            maxWidth: CYCLE_X - (INNER_X + ICON_SIZE + 6) - 8,
          })
        }

        drawText(g, `QTY ${pendingQty}`, QTY_LABEL_X0, row2Y + 4, PAL.ink, {
          maxWidth: QTY_LABEL_X1 - QTY_LABEL_X0,
        })
        const clampedPreview =
          candidateItem === null ? pendingPrice : clampStallPrice(state, candidateItem, pendingPrice)
        const priceLabel =
          clampedPreview === pendingPrice
            ? `PRICE ${pendingPrice}G`
            : `${pendingPrice}G -> ${clampedPreview}G`
        drawText(g, priceLabel, PRICE_LABEL_X0, row2Y + 4, PAL.ink, {
          maxWidth: PRICE_LABEL_X1 - PRICE_LABEL_X0,
        })

        if (candidateItem !== null) {
          const market = closingPrice(state, candidateItem)
          const floor = stallPriceFloor(state, candidateItem)
          const ceiling = stallPriceCeiling(state, candidateItem)
          const rate = previewRate(state, selected, candidateItem, pendingPrice)
          const word = rateWord(rate)
          const tail = word.length > 0 ? ` - ${word} (${Math.round(rate * 100)}% A NIGHT)` : ''
          drawText(
            g,
            `MARKET ${market}G - RANGE ${floor}G TO ${ceiling}G${tail}`,
            INNER_X,
            row3Y + 4,
            QUIET,
            { maxWidth: INNER_R - INNER_X },
          )
        } else {
          drawText(g, 'NOTHING TO PRICE UNTIL SOMETHING IS ON THE SLOT.', INNER_X, row3Y + 4, QUIET)
        }
      }

      for (let a = 0; a < actions.length; a++) {
        const action = actions[a]
        const hovered = !action.disabled && inside(p, action.x, action.y, action.w, action.h)
        plate(g, action.label, action.x, action.y, action.w, action.h, {
          hovered,
          held: hovered && p.down,
          disabled: action.disabled,
          focused: a === col,
        })
        if (hovered && p.released) fire = action
        if (a === col && activate && !action.disabled) fire = action
      }

      ctx.toastY = LOGICAL_H - 8

      // ---- act ---------------------------------------------------------
      const command = fire === null ? null : fire.run()
      if (result !== null) {
        const r = result as ActionResult
        ctx.state = r.state
        playSound(r.sound)
        ctx.say(r.message, r.ok ? 'good' : 'bad')
      }

      if (command !== null) return command
      if (input.pressed('Escape')) return { kind: 'pop' }
      return null
    },
  }
}
