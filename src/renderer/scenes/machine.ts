/**
 * The factory panel — reached by walking up to a machine and using it.
 *
 * Shows the job in progress and how long it has left, the queue behind it, whatever is
 * finished and waiting in the hopper, and every recipe the machine knows — including
 * ones the player has not reached yet, greyed with the level that opens them rather than
 * hidden. A recipe the player cannot run right now shows exactly what is short, straight
 * from `canRun()`'s own `missing` list, so this panel never invents a shortfall the game
 * layer did not report.
 *
 * Built to the conventions of `shop.ts`: a carved wood panel, a scrollable row list with
 * its own row/column keyboard cursor (arrows move it, Enter or Space activates, the
 * mouse hovers and clicks the same plates), and a footer that is the last entry of the
 * list rather than a separate control.
 */
import type { ActionResult, GameState, ItemRef } from '../../game/types'
import type { Recipe } from '../../game/farm-types'
import type { PointerState } from '../../engine/input'
import type { Scene, SceneCommand, SceneContext } from '../scene'
import { LOGICAL_H, LOGICAL_W, WORLD_Y } from '../../game/constants'
import { countItem, itemName } from '../../game/state'
import {
  HOURS_PER_NIGHT,
  canRun,
  collectMachine,
  insertIntoMachine,
  machineById,
  machineDefFor,
  machineStatus,
  recipeLevel,
} from '../../game/production'
import { productById } from '../../game/products'
import { PAL, withAlpha } from '../../engine/palette'
import { FONT_H, drawText, drawTextCentered } from '../../engine/font'
import { dither, hline, outline, rect, woodPanel } from '../../engine/pixel'
import { BUTTON_INSET } from '../../engine/ui'
import { playSound } from '../../engine/audio'
import { mixHex } from '../../art/tiles'
import { drawMachineIcon } from '../../art/structures'
import { drawProductIcon, ICON } from '../../art/goods'

/* ------------------------------------------------------------------ layout */

const PANEL_X = 8
const PANEL_Y = WORLD_Y + 4
const PANEL_W = LOGICAL_W - PANEL_X * 2
const PANEL_H = 344

const INNER_X = PANEL_X + 16
const INNER_R = PANEL_X + PANEL_W - 16

const ICON_Y = PANEL_Y + 24
const STATUS_X = INNER_X + 40
const STATUS_Y0 = PANEL_Y + 26
const STATUS_LINE = 13
const RULE_Y = PANEL_Y + 66

const ROW_Y = PANEL_Y + 74
const ROW_H = 48
const VISIBLE = 4

const NAME_X = INNER_X + 32
const ACT_W = 90
const ACT_H = 24
const ACT_X = INNER_R - ACT_W

const FOOT_RULE = ROW_Y + VISIBLE * ROW_H + 6
const FOOT_Y = FOOT_RULE + 8
const FOOT_H = 30
const FOOT_W = 176

const QUIET = mixHex(PAL.ink, PAL.parchment, 0.4)

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

/** One carved plate, identical in construction to `shop.ts`'s. */
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
  drawTextCentered(g, label, x + Math.floor(w / 2), y + Math.floor((h - FONT_H) / 2) + 1, PAL.ink, {
    small: true,
  })
  if (s.disabled && iw > 0 && ih > 0) dither(g, ix, iy, iw, ih, PAL.dusk, 0, 2)
  if (s.focused) {
    outline(g, x, y, w, h, PAL.cream)
    outline(g, x - 1, y - 1, w + 2, h + 2, withAlpha(PAL.ink, 0.5))
  }
}

/* ------------------------------------------------------------------ formatting */

/** Hours as the player thinks of them: inside tonight, or nights of sleeping on it. */
function formatHours(hours: number): string {
  if (hours <= 0) return 'NO TIME AT ALL'
  if (hours <= HOURS_PER_NIGHT) return `${hours}H`
  return `${Math.ceil(hours / HOURS_PER_NIGHT)} NIGHTS`
}

/**
 * What the player holds of one ingredient, at any grade — the same counting `canRun`
 * does internally, reproduced here only for display: a produce or product line is
 * summed across normal, silver and gold, because any grade feeds the recipe.
 */
function heldCount(state: GameState, item: ItemRef): number {
  if (item.kind === 'produce') {
    return (
      countItem(state, { kind: 'produce', cropId: item.cropId, quality: 'normal' }) +
      countItem(state, { kind: 'produce', cropId: item.cropId, quality: 'silver' }) +
      countItem(state, { kind: 'produce', cropId: item.cropId, quality: 'gold' })
    )
  }
  if (item.kind === 'product') {
    return (
      countItem(state, { kind: 'product', productId: item.productId, quality: 'normal' }) +
      countItem(state, { kind: 'product', productId: item.productId, quality: 'silver' }) +
      countItem(state, { kind: 'product', productId: item.productId, quality: 'gold' })
    )
  }
  return countItem(state, item)
}

function inputsLine(state: GameState, recipe: Recipe): string {
  return recipe.inputs
    .map((input) => `${heldCount(state, input.item)}/${input.count} ${itemName(input.item)}`)
    .join(', ')
}

/** Why a recipe cannot run right now, or '' when it can. The one source both the
 *  disabled state and the printed shortfall read from, so they never disagree. */
function reasonFor(state: GameState, recipe: Recipe): string {
  const need = recipeLevel(recipe)
  if (state.progression.level < need) return `NEEDS LEVEL ${need}`
  const check = canRun(state, recipe)
  if (!check.ok) {
    return `SHORT ${check.missing.map((m) => `${m.short} ${itemName(m.item)}`).join(', ')}`
  }
  return ''
}

/* ------------------------------------------------------------------ rows */

interface Action {
  label: string
  x: number
  w: number
  disabled: boolean
  run(): SceneCommand | null
}

interface Row {
  recipe: Recipe
  outputName: string
  icon(g: CanvasRenderingContext2D, x: number, y: number): void
  inputs: string
  reason: string
  locked: boolean
  actions: Action[]
  spoken: string
}

function buildRows(
  state: GameState,
  machineId: string,
  recipes: readonly Recipe[],
  take: (result: ActionResult) => void,
): Row[] {
  return recipes.map((recipe): Row => {
    const product = productById(recipe.outputProductId)
    const outputName = product !== undefined ? product.name : recipe.outputProductId.toUpperCase()
    const reason = reasonFor(state, recipe)
    const locked = state.progression.level < recipeLevel(recipe)
    const countTag = recipe.outputCount > 1 ? `${recipe.outputCount}X ` : ''

    return {
      recipe,
      outputName,
      icon: (g, x, y) => {
        if (product !== undefined) drawProductIcon(g, product, 'normal', x, y)
        else outline(g, x + 4, y + 4, ICON - 8, ICON - 8, PAL.dusk)
      },
      inputs: inputsLine(state, recipe),
      reason,
      locked,
      actions: [
        {
          label: 'MAKE',
          x: ACT_X,
          w: ACT_W,
          disabled: reason !== '',
          run: () => {
            take(insertIntoMachine(state, machineId, recipe.id))
            return null
          },
        },
      ],
      spoken: `${countTag}${outputName}, ${recipe.hours} hours. ${reason === '' ? 'READY.' : reason}`,
    }
  })
}

/* ------------------------------------------------------------------ scene */

export function createMachineScene(machineId: string): Scene {
  let cursor = 0
  let col = 0
  let scroll = 0
  let spokenRow = -1

  const clampView = (count: number): void => {
    if (cursor > count) cursor = count
    if (cursor < 0) cursor = 0
    const onRow = Math.min(cursor, Math.max(0, count - 1))
    if (onRow < scroll) scroll = onRow
    if (onRow >= scroll + VISIBLE) scroll = onRow - VISIBLE + 1
    const maxScroll = Math.max(0, count - VISIBLE)
    if (scroll > maxScroll) scroll = maxScroll
    if (scroll < 0) scroll = 0
  }

  return {
    id: 'machine',

    update(ctx: SceneContext, input, _ui, dt, frame): SceneCommand | null {
      ctx.tick(dt, frame)
      const g = ctx.g

      const machine = machineById(ctx.state, machineId)
      if (machine === null) return { kind: 'pop' }
      const def = machineDefFor(machine.kind)
      const status = machineStatus(ctx.state, machineId)
      if (def === null || status === null) return { kind: 'pop' }

      const state = ctx.state
      const p = input.pointer

      const results: ActionResult[] = []
      const take = (result: ActionResult): void => {
        results.push(result)
      }

      const rows = buildRows(state, machineId, def.recipes, take)

      const footActions: Action[] = [
        {
          label: status.readyCount > 0 ? `COLLECT ${status.readyCount}` : 'NOTHING TO COLLECT',
          x: INNER_X,
          w: FOOT_W,
          disabled: status.readyCount === 0,
          run: () => {
            take(collectMachine(state, machineId))
            return null
          },
        },
        {
          label: 'CLOSE',
          x: INNER_R - FOOT_W,
          w: FOOT_W,
          disabled: false,
          run: () => ({ kind: 'pop' }),
        },
      ]

      clampView(rows.length)
      const onFooter = cursor >= rows.length
      const cursorActions = onFooter ? footActions : (rows[cursor]?.actions ?? [])

      // ---- keyboard ------------------------------------------------------
      const moveRow = (delta: number): void => {
        const next = Math.min(rows.length, Math.max(0, cursor + delta))
        if (next === cursor) return
        cursor = next
        col = 0
        clampView(rows.length)
        playSound('select')
      }
      const moveCol = (delta: number): void => {
        if (cursorActions.length === 0) return
        const next = Math.min(cursorActions.length - 1, Math.max(0, col + delta))
        if (next === col) return
        col = next
        playSound('select')
      }

      if (input.repeated('ArrowDown') || input.repeated('KeyS')) moveRow(1)
      if (input.repeated('ArrowUp') || input.repeated('KeyW')) moveRow(-1)
      if (input.repeated('ArrowRight') || input.repeated('KeyD')) moveCol(1)
      if (input.repeated('ArrowLeft') || input.repeated('KeyA')) moveCol(-1)
      if (input.repeated('PageDown')) moveRow(VISIBLE)
      if (input.repeated('PageUp')) moveRow(-VISIBLE)

      const activate = input.pressed('Enter') || input.pressed('NumpadEnter') || input.pressed('Space')

      // ---- panel and header -----------------------------------------------
      woodPanel(g, PANEL_X, PANEL_Y, PANEL_W, PANEL_H)
      drawTextCentered(g, def.name, PANEL_X + PANEL_W / 2, PANEL_Y + 14, PAL.ink)

      drawMachineIcon(g, def, INNER_X, ICON_Y)

      const activeText =
        status.active === null
          ? 'NOTHING IN PROGRESS.'
          : `MAKING ${status.output !== null ? itemName(status.output) : 'SOMETHING'} - ${formatHours(status.active.hoursLeft)} LEFT.`
      const queueText =
        status.queued > 0
          ? `${status.queued} MORE JOB${status.queued === 1 ? '' : 'S'} QUEUED, ${status.free} FREE.`
          : `${status.free} SLOT${status.free === 1 ? '' : 'S'} FREE IN THE QUEUE.`
      const readyText =
        status.readyCount > 0
          ? `${status.readyCount} WAITING TO COLLECT.`
          : 'NOTHING WAITING TO COLLECT.'

      drawText(g, activeText, STATUS_X, STATUS_Y0, PAL.ink, { maxWidth: INNER_R - STATUS_X })
      drawText(g, queueText, STATUS_X, STATUS_Y0 + STATUS_LINE, QUIET, { maxWidth: INNER_R - STATUS_X })
      drawText(
        g,
        readyText,
        STATUS_X,
        STATUS_Y0 + STATUS_LINE * 2,
        status.readyCount > 0 ? PAL.leaf : QUIET,
        { maxWidth: INNER_R - STATUS_X },
      )
      hline(g, INNER_X, RULE_Y, INNER_R - INNER_X, PAL.bark)

      // ---- recipe rows -------------------------------------------------
      let fire: Action | null = null

      for (let i = scroll; i < Math.min(rows.length, scroll + VISIBLE); i++) {
        const row = rows[i]
        const ry = ROW_Y + (i - scroll) * ROW_H
        const onRow = i === cursor
        const rowHovered = inside(p, INNER_X - 8, ry, INNER_R - INNER_X + 16, ROW_H)

        if (i % 2 === 1) rect(g, INNER_X - 8, ry, INNER_R - INNER_X + 16, ROW_H - 1, mixHex(PAL.parchment, PAL.soil, 0.1))
        if (onRow) {
          rect(g, INNER_X - 8, ry, 3, ROW_H - 1, PAL.lantern)
          rect(g, INNER_X - 8, ry, INNER_R - INNER_X + 16, ROW_H - 1, withAlpha(PAL.lantern, 0.12))
        }
        if (rowHovered && p.pressed && cursor !== i) {
          cursor = i
          col = 0
          playSound('select')
        }

        row.icon(g, INNER_X, ry + (ROW_H - ICON) / 2)

        const countTag = row.recipe.outputCount > 1 ? `${row.recipe.outputCount}X ` : ''
        const title = `${countTag}${row.outputName} - ${row.recipe.hours}H`
        drawText(g, title, NAME_X, ry + 1, row.locked ? QUIET : PAL.ink, { maxWidth: ACT_X - 8 - NAME_X })
        drawText(g, row.inputs, NAME_X, ry + 15, QUIET, { maxWidth: ACT_X - 8 - NAME_X })
        if (row.reason !== '') {
          drawText(g, row.reason, NAME_X, ry + 29, PAL.berry, { maxWidth: ACT_X - 8 - NAME_X })
        }

        for (let a = 0; a < row.actions.length; a++) {
          const action = row.actions[a]
          const by = ry + Math.floor((ROW_H - ACT_H) / 2)
          const hovered = !action.disabled && inside(p, action.x, by, action.w, ACT_H)
          plate(g, action.label, action.x, by, action.w, ACT_H, {
            hovered,
            held: hovered && p.down,
            disabled: action.disabled,
            focused: onRow && a === col,
          })
          if (hovered && p.released) fire = action
          if (onRow && a === col && activate && !action.disabled) fire = action
        }
      }

      if (rows.length === 0) {
        drawTextCentered(g, 'THIS MACHINE KNOWS NO RECIPES.', PANEL_X + PANEL_W / 2, ROW_Y + 20, QUIET)
      }

      if (cursor !== spokenRow) {
        spokenRow = cursor
        const row = rows[cursor]
        ctx.announce(row === undefined ? `THE ${def.name}.` : row.spoken)
      }

      // ---- footer ------------------------------------------------------
      hline(g, INNER_X, FOOT_RULE, INNER_R - INNER_X, PAL.bark)
      for (let a = 0; a < footActions.length; a++) {
        const action = footActions[a]
        const hovered = !action.disabled && inside(p, action.x, FOOT_Y, action.w, FOOT_H)
        plate(g, action.label, action.x, FOOT_Y, action.w, FOOT_H, {
          hovered,
          held: hovered && p.down,
          disabled: action.disabled,
          focused: onFooter && a === col,
        })
        if (hovered && p.released) fire = action
        if (onFooter && a === col && activate && !action.disabled) fire = action
      }

      ctx.toastY = LOGICAL_H - 8

      // ---- act -----------------------------------------------------------
      const command = fire === null ? null : fire.run()
      const result = results[results.length - 1]
      if (result !== undefined) {
        ctx.state = result.state
        playSound(result.sound)
        ctx.say(result.message, result.ok ? 'good' : 'bad')
      }

      if (command !== null) return command
      if (input.pressed('Escape')) return { kind: 'pop' }
      return null
    },
  }
}
