/**
 * The order board — the ledger on the farmhouse desk.
 *
 * Orders are how a farm turns produce into standing rather than only into gold, and until
 * now they were unreachable: `acceptOrder` and `fulfilOrder` had a full set of rules,
 * refusals and rewards, and nothing in the game called either of them. The board was rolled
 * every night, expired every night, and never once shown.
 *
 * Every order on the board is listed, taken or not, with what it wants against what the bag
 * actually holds, what it pays, and how long is left. An order that cannot be filled says
 * exactly what is short — from the same count `fulfilOrder` will do — so the disabled button
 * and the printed reason can never disagree.
 *
 * Built to the conventions of `machine.ts`: a carved wood panel, a scrolling row list with
 * its own row/column keyboard cursor, and a footer that is the last row of the list.
 */
import type { ActionResult, GameState, ItemRef, Quality } from '../../game/types'
import type { Order } from '../../game/farm-types'
import type { PointerState } from '../../engine/input'
import type { Scene, SceneCommand, SceneContext } from '../scene'
import { LOGICAL_H, LOGICAL_W, WORLD_Y } from '../../game/constants'
import { countItem, itemName } from '../../game/state'
import {
  LOAN_MINIMUM,
  MAX_LOANS,
  acceptOrder,
  canFulfil,
  creditAvailable,
  creditLimit,
  fulfilOrder,
  loanRate,
  maxAcceptedOrders,
  repayLoan,
  reputationRank,
  seasonLabel,
  takeLoan,
  totalDebt,
} from '../../game/market'
import { absoluteDay } from '../../game/economy'
import { formatMaterials } from '../../game/progression'
import { PAL, withAlpha } from '../../engine/palette'
import { FONT_H, drawText, drawTextCentered } from '../../engine/font'
import { dither, hline, outline, rect, woodPanel } from '../../engine/pixel'
import { BUTTON_INSET } from '../../engine/ui'
import { playSound } from '../../engine/audio'
import { mixHex } from '../../art/tiles'

/* ------------------------------------------------------------------ layout */

const PANEL_X = 8
const PANEL_Y = WORLD_Y + 4
const PANEL_W = LOGICAL_W - PANEL_X * 2
const PANEL_H = 344

const INNER_X = PANEL_X + 16
const INNER_R = PANEL_X + PANEL_W - 16

const STATUS_Y0 = PANEL_Y + 32
const STATUS_LINE = 13
const RULE_Y = PANEL_Y + 66

const ROW_Y = PANEL_Y + 74
const ROW_H = 48
const VISIBLE = 4

const ACT_W = 100
const ACT_H = 24
const ACT_X = INNER_R - ACT_W

const FOOT_RULE = ROW_Y + VISIBLE * ROW_H + 6
const FOOT_Y = FOOT_RULE + 8
const FOOT_H = 30
const FOOT_W = 176

const QUIET = mixHex(PAL.ink, PAL.parchment, 0.4)

const TABS = ['ORDERS', 'THE BANK'] as const
const TAB_W = 150
const TAB_H = 22
const TAB_Y = PANEL_Y + 44
const TAB_X = INNER_X

/** What the bank will lend, in the steps a player actually thinks in. */
const LOAN_STEPS: readonly number[] = [500, 1000, 2500, 5000]

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

/** One carved plate, identical in construction to `machine.ts`'s and `shop.ts`'s. */
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

/* --------------------------------------------------------------- formatting */

const QUALITY_ORDER: readonly Quality[] = ['normal', 'silver', 'gold']

/**
 * What the bag holds against one line, counted the way `fulfilOrder` counts it: a line
 * with a minimum grade accepts that grade *and better*, so a gold crop fills a normal
 * request. Reproduced here for display only — the verb still decides.
 */
function heldForLine(state: GameState, line: Order['lines'][number]): number {
  const item = line.item
  if (item.kind !== 'produce' && item.kind !== 'product') return countItem(state, item)

  const floor = QUALITY_ORDER.indexOf(line.minQuality)
  let total = 0
  for (let i = Math.max(0, floor); i < QUALITY_ORDER.length; i++) {
    const ref: ItemRef =
      item.kind === 'produce'
        ? { kind: 'produce', cropId: item.cropId, quality: QUALITY_ORDER[i] }
        : { kind: 'product', productId: item.productId, quality: QUALITY_ORDER[i] }
    total += countItem(state, ref)
  }
  return total
}

function linesText(state: GameState, order: Order): string {
  return order.lines
    .map((line) => {
      const grade = line.minQuality === 'normal' ? '' : ` ${line.minQuality.toUpperCase()}+`
      return `${heldForLine(state, line)}/${line.count} ${itemName(line.item)}${grade}`
    })
    .join(', ')
}

function rewardText(order: Order): string {
  const parts = [`${order.reward}G`, `${order.xpReward} XP`, `+${order.reputationReward} STANDING`]
  const materials = formatMaterials(order.materialReward)
  if (materials.length > 0) parts.push(materials)
  return parts.join(', ')
}

/** Days left, and what it costs to let one slip. An accepted order is a promise. */
function dueText(state: GameState, order: Order): string {
  const days = order.dueDay - absoluteDay(state)
  if (days < 0) return 'OVERDUE'
  const left = days === 0 ? 'DUE TODAY' : days === 1 ? '1 DAY LEFT' : `${days} DAYS LEFT`
  if (!order.accepted) return left
  return `${left} - ${order.reputationPenalty} STANDING IF MISSED`
}

/**
 * Why this order's button is off, or '' when it is on. The one source both the disabled
 * state and the printed reason read from, so a greyed button always explains itself.
 */
function reasonFor(state: GameState, order: Order): string {
  const days = order.dueDay - absoluteDay(state)
  if (days < 0) return 'EXPIRED - IT CLEARS TONIGHT'

  if (!order.accepted) {
    const cap = maxAcceptedOrders(state)
    const open = state.orders.filter((o) => o.accepted).length
    if (open >= cap) return `${cap} ORDERS IS ALL YOU CAN CARRY`
    return ''
  }

  if (canFulfil(state, order)) return ''
  const short = order.lines
    .map((line) => ({ line, missing: line.count - heldForLine(state, line) }))
    .filter((s) => s.missing > 0)
    .map((s) => `${s.missing} ${itemName(s.line.item)}`)
    .join(', ')
  return `SHORT ${short}`
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
  /** The order this row is about, or null for a bank row, which is about money. */
  order: Order | null
  title: string
  lines: string
  reward: string
  due: string
  reason: string
  actions: Action[]
  spoken: string
}

/**
 * The board, sorted so what the player can act on is at the top: accepted-and-fillable
 * first, then accepted, then offers. Within a group the nearest due date leads, because
 * that is the one about to cost something.
 */
function sortBoard(state: GameState, orders: readonly Order[]): Order[] {
  const weight = (o: Order): number => {
    if (o.accepted && canFulfil(state, o)) return 0
    if (o.accepted) return 1
    return 2
  }
  return [...orders].sort((a, b) => weight(a) - weight(b) || a.dueDay - b.dueDay)
}

/**
 * The bank shelf: what can be borrowed, and what is owed.
 *
 * `takeLoan` and `repayLoan` were the last two orphaned trade verbs — a credit limit that
 * grew with the farm, interest that accrued every season, a penalty for missing a payment,
 * and no way to borrow a coin. Debt belongs on the same desk as the orders because both
 * are the farm's books.
 */
function bankRows(state: GameState, take: (result: ActionResult) => void): Row[] {
  const rows: Row[] = []
  const room = creditAvailable(state)
  const rate = loanRate(state)
  const ratePct = Math.round(rate * 1000) / 10

  for (const amount of LOAN_STEPS) {
    const atLimit = state.loans.length >= MAX_LOANS
    const reason = atLimit
      ? `${MAX_LOANS} LOANS IS THE LIMIT`
      : amount > room
        ? `ONLY ${room}G OF CREDIT LEFT`
        : ''
    rows.push({
      order: null,
      title: `BORROW ${amount}G`,
      lines: `${ratePct}% A SEASON, REPAID OVER FOUR`,
      reward: reason === '' ? `${room}G OF CREDIT LEFT AFTER THIS: ${room - amount}G` : reason,
      due: '',
      reason,
      actions: [
        {
          label: 'BORROW',
          x: ACT_X,
          w: ACT_W,
          disabled: reason !== '',
          run: () => {
            take(takeLoan(state, amount))
            return null
          },
        },
      ],
      spoken: `Borrow ${amount} gold at ${ratePct} per cent a season. ${reason === '' ? 'AVAILABLE.' : reason}`,
    })
  }

  for (const loan of state.loans) {
    const pay = Math.min(loan.outstanding, state.gold)
    const reason = state.gold <= 0 ? 'NO GOLD TO PAY WITH' : ''
    const missed = loan.missedPayments > 0 ? `, ${loan.missedPayments} MISSED` : ''
    rows.push({
      order: null,
      title: `OWING ${loan.outstanding}G`,
      lines: `BORROWED ${loan.principal}G AT ${Math.round(loan.ratePerSeason * 1000) / 10}%${missed}`,
      reward: `DUE BY ${seasonLabel(loan.dueSeason).toUpperCase()}`,
      due: '',
      reason,
      actions: [
        {
          label: pay >= loan.outstanding ? 'CLEAR IT' : `PAY ${pay}G`,
          x: ACT_X,
          w: ACT_W,
          disabled: reason !== '',
          run: () => {
            take(repayLoan(state, loan.id, pay))
            return null
          },
        },
      ],
      spoken: `Owing ${loan.outstanding} gold, due by ${seasonLabel(loan.dueSeason)}. ${
        reason === '' ? `Pay ${pay} gold.` : reason
      }`,
    })
  }

  return rows
}

function buildRows(
  state: GameState,
  take: (result: ActionResult) => void,
): Row[] {
  return sortBoard(state, state.orders).map((order): Row => {
    const reason = reasonFor(state, order)
    const kind = order.kind === 'crate' ? 'CRATE' : 'ORDER'
    const ready = order.accepted && canFulfil(state, order)
    const title = order.accepted ? `${kind} - ACCEPTED${ready ? ', READY' : ''}` : `${kind} - OFFERED`

    return {
      order,
      title,
      lines: linesText(state, order),
      reward: rewardText(order),
      due: dueText(state, order),
      reason,
      actions: [
        {
          label: order.accepted ? 'DELIVER' : 'ACCEPT',
          x: ACT_X,
          w: ACT_W,
          disabled: reason !== '',
          run: () => {
            take(order.accepted ? fulfilOrder(state, order.id) : acceptOrder(state, order.id))
            return null
          },
        },
      ],
      spoken: `${title}. ${linesText(state, order)}. ${rewardText(order)}. ${dueText(state, order)}. ${
        reason === '' ? 'READY.' : reason
      }`,
    }
  })
}

/* ------------------------------------------------------------------ scene */

/**
 * The order board. Reached by walking up to the ledger inside the farmhouse, which is why
 * it takes no argument: there is one board, and the desk it sits on is the way to it.
 */
export function createOrdersScene(): Scene {
  let tab = 0
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
    id: 'orders',

    update(ctx: SceneContext, input, _ui, dt, frame): SceneCommand | null {
      ctx.tick(dt, frame)
      const g = ctx.g
      const state = ctx.state
      const p = input.pointer

      const results: ActionResult[] = []
      const take = (result: ActionResult): void => {
        results.push(result)
      }

      const rows = tab === 0 ? buildRows(state, take) : bankRows(state, take)

      const footActions: Action[] = [
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

      // ---- keyboard --------------------------------------------------------
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

      const switchTab = (next: number): void => {
        const clamped = (next + TABS.length) % TABS.length
        if (clamped === tab) return
        tab = clamped
        cursor = 0
        col = 0
        scroll = 0
        spokenRow = -1
        playSound('select')
        ctx.announce(`${TABS[tab]}.`)
      }
      if (input.pressed('Tab')) switchTab(tab + 1)
      if (input.pressed('Digit1')) switchTab(0)
      if (input.pressed('Digit2')) switchTab(1)

      const activate =
        input.pressed('Enter') || input.pressed('NumpadEnter') || input.pressed('Space')

      // ---- panel and header ------------------------------------------------
      woodPanel(g, PANEL_X, PANEL_Y, PANEL_W, PANEL_H)
      drawTextCentered(g, 'THE ORDER BOARD', PANEL_X + PANEL_W / 2, PANEL_Y + 14, PAL.ink)

      const accepted = state.orders.filter((o) => o.accepted).length
      const cap = maxAcceptedOrders(state)
      const rank = reputationRank(state.market.reputation)

      drawText(
        g,
        `STANDING ${state.market.reputation} - ${rank.toUpperCase()}`,
        INNER_X,
        STATUS_Y0,
        PAL.ink,
        { maxWidth: INNER_R - INNER_X },
      )
      drawText(
        g,
        tab === 0
          ? `CARRYING ${accepted} OF ${cap} ORDERS. AN ORDER PAST ITS DATE COSTS STANDING.`
          : `OWING ${totalDebt(state)}G OF ${creditLimit(state)}G CREDIT, AT ${
              Math.round(loanRate(state) * 1000) / 10
            }% A SEASON. LEAST ${LOAN_MINIMUM}G.`,
        INNER_X,
        STATUS_Y0 + STATUS_LINE,
        QUIET,
        { maxWidth: INNER_R - INNER_X },
      )

      for (let t = 0; t < TABS.length; t++) {
        const tx = TAB_X + t * (TAB_W + 8)
        const hovered = inside(p, tx, TAB_Y, TAB_W, TAB_H)
        plate(g, TABS[t], tx, TAB_Y, TAB_W, TAB_H, {
          hovered,
          held: hovered && p.down,
          disabled: false,
          focused: t === tab,
        })
        if (hovered && p.released) switchTab(t)
      }

      hline(g, INNER_X, RULE_Y, INNER_R - INNER_X, PAL.bark)

      // ---- rows ------------------------------------------------------------
      let fire: Action | null = null

      if (rows.length === 0) {
        drawTextCentered(
          g,
          tab === 0
            ? 'THE BOARD IS BARE. SLEEP, AND THE VALLEY WILL WANT SOMETHING.'
            : 'THE BANK HAS NOTHING FOR YOU YET.',
          PANEL_X + PANEL_W / 2,
          ROW_Y + 24,
          QUIET,
        )
      }

      for (let i = scroll; i < Math.min(rows.length, scroll + VISIBLE); i++) {
        const row = rows[i]
        const y = ROW_Y + (i - scroll) * ROW_H
        const focusedRow = !onFooter && i === cursor

        if ((i & 1) === 1) {
          rect(g, INNER_X - 6, y - 2, INNER_R - INNER_X + 12, ROW_H - 4, withAlpha(PAL.bark, 0.14))
        }

        const ready = row.order !== null && row.order.accepted && row.reason === ''
        drawText(g, row.title, INNER_X, y + 2, ready ? PAL.ink : QUIET, {
          maxWidth: ACT_X - INNER_X - 8,
        })
        drawText(g, row.lines, INNER_X, y + 2 + FONT_H + 2, PAL.ink, {
          maxWidth: ACT_X - INNER_X - 8,
        })
        drawText(g, row.reward, INNER_X, y + 2 + (FONT_H + 2) * 2, QUIET, {
          maxWidth: ACT_X - INNER_X - 8,
        })
        drawText(
          g,
          row.reason === '' ? row.due : `${row.due}   ${row.reason}`,
          INNER_X,
          y + 2 + (FONT_H + 2) * 3,
          QUIET,
          { maxWidth: ACT_X - INNER_X - 8 },
        )

        for (let a = 0; a < row.actions.length; a++) {
          const action = row.actions[a]
          const ay = y + Math.floor((ROW_H - ACT_H) / 2)
          const hovered = inside(p, action.x, ay, action.w, ACT_H) && !action.disabled
          plate(g, action.label, action.x, ay, action.w, ACT_H, {
            hovered,
            held: hovered && p.down,
            disabled: action.disabled,
            focused: focusedRow && a === col,
          })
          if (hovered && p.released) fire = action
          if (focusedRow && a === col && activate && !action.disabled) fire = action
        }
      }

      // ---- footer ----------------------------------------------------------
      hline(g, INNER_X, FOOT_RULE, INNER_R - INNER_X, PAL.bark)
      for (let a = 0; a < footActions.length; a++) {
        const action = footActions[a]
        const hovered = inside(p, action.x, FOOT_Y, action.w, FOOT_H) && !action.disabled
        plate(g, action.label, action.x, FOOT_Y, action.w, FOOT_H, {
          hovered,
          held: hovered && p.down,
          disabled: action.disabled,
          focused: onFooter && a === col,
        })
        if (hovered && p.released) fire = action
        if (onFooter && a === col && activate && !action.disabled) fire = action
      }

      // ---- speak the focused row ------------------------------------------
      if (cursor !== spokenRow) {
        spokenRow = cursor
        const row = rows[cursor]
        ctx.announce(row === undefined ? 'CLOSE THE BOARD.' : row.spoken)
      }

      ctx.toastY = LOGICAL_H - 8

      // ---- act -------------------------------------------------------------
      const command = fire === null ? null : fire.run()
      const result = results[results.length - 1]
      if (result !== undefined) {
        ctx.state = result.state
        playSound(result.sound)
        ctx.say(result.message, result.ok ? 'good' : 'bad')
        // A delivered order leaves the board, so the cursor must not keep its old row.
        spokenRow = -1
      }

      if (command !== null) return command
      if (input.pressed('Escape')) return { kind: 'pop' }
      return null
    },
  }
}
