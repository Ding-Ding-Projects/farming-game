import type { ActionResult, ItemRef } from '../../game/types'
import type { Scene, SceneCommand, SceneContext } from '../scene'
import { LOGICAL_W, WORLD_Y } from '../../game/constants'
import { countItem, itemKey, itemName } from '../../game/state'
import { buy, sell, sellAllProduce, sellValue, shopStock } from '../../game/shop'
import { cropById } from '../../game/crops'
import { PAL } from '../../engine/palette'
import { drawText, textWidth } from '../../engine/font'
import { hline, rect } from '../../engine/pixel'
import { playSound } from '../../engine/audio'
import { mixHex } from '../../art/tiles'
import { drawSeedIcon } from '../../art/plants'
import { drawGoodIcon } from '../../art/actors'

const PANEL_X = 2
const PANEL_Y = WORLD_Y + 2
const PANEL_W = LOGICAL_W - PANEL_X * 2
const PANEL_H = 170

const ROW_Y = PANEL_Y + 18
const ROW_H = 18
const BUY_QTY = [1, 5, 10] as const
const BUY_X = [188, 216, 244] as const
const BUY_W = 26
const SELL_X = 274
const SELL_W = 38
const BTN_H = 13
/** Four buttons per row: the three buy sizes and the sell. */
const ROW_BUTTONS = 4

const FOOT_Y = PANEL_Y + PANEL_H - 22
const QUIET = mixHex(PAL.ink, PAL.parchment, 0.4)
const STRIPE = mixHex(PAL.parchment, PAL.soil, 0.1)

function drawEntryIcon(
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
  if (crop !== undefined) drawSeedIcon(ctx, crop, x, y)
}

function produceTotal(ctx: SceneContext): number {
  let total = 0
  for (const entry of ctx.state.inventory) {
    if (entry.item.kind !== 'produce') continue
    total += sellValue(entry.item) * entry.count
  }
  return total
}

export function createShopScene(): Scene {
  const apply = (ctx: SceneContext, result: ActionResult): void => {
    ctx.state = result.state
    playSound(result.sound)
    ctx.say(result.message, result.ok ? 'good' : 'bad')
  }

  return {
    id: 'shop',

    update(ctx: SceneContext, input, ui, dt, frame): SceneCommand | null {
      ctx.tick(dt, frame)
      const g = ctx.g
      const state = ctx.state
      const stock = shopStock(state)

      ui.begin(g, input)

      const before = ui.focusedId()
      if (input.repeated('ArrowDown') || input.repeated('KeyS')) ui.focusNext(ROW_BUTTONS)
      if (input.repeated('ArrowUp') || input.repeated('KeyW')) ui.focusNext(-ROW_BUTTONS)
      if (input.repeated('ArrowRight') || input.repeated('KeyD')) ui.focusNext(1)
      if (input.repeated('ArrowLeft') || input.repeated('KeyA')) ui.focusNext(-1)
      if (input.pressed('Tab')) ui.focusNext(1)
      if (ui.focusedId() !== before) playSound('select')

      ui.panel(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 'GENERAL STORE')
      drawText(g, `${state.season.toUpperCase()} STOCK`, PANEL_X + 8, PANEL_Y + 4, QUIET)
      const purse = `${state.gold}G`
      drawText(g, purse, PANEL_X + PANEL_W - 8 - textWidth(purse), PANEL_Y + 4, PAL.ink)

      let pending: ActionResult | null = null

      for (let i = 0; i < stock.length; i++) {
        const entry = stock[i]
        const ry = ROW_Y + i * ROW_H
        const key = itemKey(entry.item)
        const held = countItem(state, entry.item)

        if (i % 2 === 1) rect(g, PANEL_X + 5, ry, PANEL_W - 10, ROW_H - 1, STRIPE)
        drawEntryIcon(g, entry.item, PANEL_X + 6, ry + 3)

        // The packet icon already says "seeds"; the row only needs the crop.
        const label =
          entry.item.kind === 'seed'
            ? (cropById(entry.item.cropId)?.name ?? itemName(entry.item))
            : itemName(entry.item)
        drawText(g, label, PANEL_X + 22, ry + 1, PAL.ink, { maxWidth: 80 })
        const price = `${entry.price}G`
        drawText(g, price, 106, ry + 1, state.gold < entry.price ? PAL.berry : PAL.ink)
        if (held > 0) drawText(g, `HAVE ${held}`, 144, ry + 1, QUIET)
        drawText(g, entry.note, PANEL_X + 22, ry + 10, QUIET, { maxWidth: 162 })

        for (let q = 0; q < BUY_QTY.length; q++) {
          const qty = BUY_QTY[q]
          const cost = entry.price * qty
          if (
            ui.button(`shop.buy${qty}.${key}`, `X${qty}`, BUY_X[q], ry + 2, BUY_W, BTN_H, {
              disabled: state.gold < cost,
            })
          ) {
            pending = buy(state, entry.item, qty)
          }
        }
        if (
          ui.button(`shop.sell.${key}`, 'SELL', SELL_X, ry + 2, SELL_W, BTN_H, {
            disabled: held < 1,
          })
        ) {
          pending = sell(state, entry.item, 1)
        }
      }

      // ---- footer ------------------------------------------------------
      hline(g, PANEL_X + 6, FOOT_Y - 4, PANEL_W - 12, PAL.bark)
      const total = produceTotal(ctx)
      drawText(g, 'IN THE TIN', PANEL_X + 8, FOOT_Y + 1, QUIET)
      drawText(g, purse, PANEL_X + 8, FOOT_Y + 10, PAL.ink)

      const sellAll = ui.button(
        'shop.sellall',
        total > 0 ? `SELL ALL PRODUCE - ${total}G` : 'NO PRODUCE TO SELL',
        PANEL_X + 74,
        FOOT_Y,
        168,
        16,
        { disabled: total <= 0 },
      )
      const close = ui.button('shop.close', 'CLOSE', PANEL_X + 254, FOOT_Y, 56, 16)
      ui.end()

      if (sellAll) pending = sellAllProduce(state)
      if (pending !== null) apply(ctx, pending)

      ctx.toastY = PANEL_Y + PANEL_H + 26

      if (close || input.pressed('Escape') || input.pressed('KeyB')) return { kind: 'pop' }
      return null
    },
  }
}
