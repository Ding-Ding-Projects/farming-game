/**
 * The coop or barn panel — reached by walking up to an animal building and using it.
 *
 * Every animal living inside is shown with its full care state — friendship as hearts
 * and the exact number, whether it has eaten and been fussed over today, whether it has
 * produce waiting, and whether it is young or unwell — and every verb
 * `src/game/livestock.ts` offers for a single animal is reachable here: feed, pet,
 * collect and let out to pasture. `FEED ALL` and `COLLECT ALL` are a thin loop over
 * those same per-animal verbs, run one animal at a time, so the totals they report are
 * never invented — they are exactly what feeding or collecting the herd one by one adds
 * up to.
 *
 * Built to the conventions of `shop.ts`: a carved wood panel, a scrollable row list with
 * its own row/column keyboard cursor (arrows move it, Enter or Space activates, the
 * mouse hovers and clicks the same plates), and a footer that is the last entry of the
 * list rather than a separate control.
 */
import type { ActionResult, GameState } from '../../game/types'
import type { Animal, SpeciesDef } from '../../game/farm-types'
import type { PointerState } from '../../engine/input'
import type { Scene, SceneCommand, SceneContext } from '../scene'
import { LOGICAL_H, LOGICAL_W, WORLD_Y } from '../../game/constants'
import {
  MAX_FRIENDSHIP,
  ageInDays,
  animalsIn,
  collectProduce,
  feedAnimal,
  friendshipLabel,
  hayCapacity,
  isProduceReady,
  letOut,
  petAnimal,
} from '../../game/livestock'
import { buildingDef } from '../../game/buildings'
import { speciesById } from '../../game/species'
import { PAL, withAlpha } from '../../engine/palette'
import { FONT_H, drawText, drawTextCentered, textWidth } from '../../engine/font'
import { dither, drawSprite, hline, makeSprite, outline, rect, woodPanel } from '../../engine/pixel'
import { BUTTON_INSET } from '../../engine/ui'
import { playSound } from '../../engine/audio'
import { mixHex } from '../../art/tiles'
import { drawAnimalIcon } from '../../art/livestock'

/* ------------------------------------------------------------------ layout */

const PANEL_X = 8
const PANEL_Y = WORLD_Y + 4
const PANEL_W = LOGICAL_W - PANEL_X * 2
const PANEL_H = 344

const INNER_X = PANEL_X + 16
const INNER_R = PANEL_X + PANEL_W - 16

const SUB_Y = PANEL_Y + 30
const RULE_Y = PANEL_Y + 44

const ROW_Y = PANEL_Y + 52
const ROW_H = 56
const VISIBLE = 4

const ICON_X = INNER_X
const NAME_X = INNER_X + 40
const HEART_X = INNER_X + 236

const ACT_W = 58
const ACT_H = 22
const ACT_GAP = 4
const ACT_X = [0, 1, 2, 3].map((i) => INNER_R - (4 - i) * (ACT_W + ACT_GAP) + ACT_GAP)

const FOOT_RULE = ROW_Y + VISIBLE * ROW_H + 6
const FOOT_Y = FOOT_RULE + 8
const FOOT_H = 30
const FOOT_W = 176
const FOOT_GAP = 8

const QUIET = mixHex(PAL.ink, PAL.parchment, 0.4)

/* ------------------------------------------------------------------ hearts */

const HEART_ROWS = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...']
const HEART_FILLED = makeSprite(HEART_ROWS, { '#': PAL.berry })
const HEART_EMPTY = makeSprite(HEART_ROWS, { '#': mixHex(PAL.parchment, PAL.soil, 0.4) })
const HEART_STEP = 8
const HEART_COUNT = 5

/** Draws the five-heart meter and returns the x just past its right edge. */
function drawHearts(g: CanvasRenderingContext2D, x: number, y: number, friendship: number): number {
  const filled = Math.max(0, Math.min(HEART_COUNT, Math.round((friendship / MAX_FRIENDSHIP) * HEART_COUNT)))
  for (let i = 0; i < HEART_COUNT; i++) {
    drawSprite(g, i < filled ? HEART_FILLED : HEART_EMPTY, x + i * HEART_STEP, y)
  }
  return x + HEART_COUNT * HEART_STEP
}

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

/* ------------------------------------------------------------------ rows */

interface Action {
  label: string
  x: number
  w: number
  disabled: boolean
  /** Never called for a disabled action. */
  run(): SceneCommand | null
}

type TagState = 'on' | 'off' | 'warn'

interface Tag {
  text: string
  state: TagState
}

interface Row {
  species: SpeciesDef
  animal: Animal
  title: string
  tags: Tag[]
  actions: Action[]
  spoken: string
}

function tagColor(state: TagState): string {
  if (state === 'on') return PAL.leaf
  if (state === 'warn') return PAL.berry
  return QUIET
}

/** Draws a row of short status words, left to right, coloured by their state. */
function drawTags(g: CanvasRenderingContext2D, tags: Tag[], x: number, y: number): void {
  let cx = x
  for (const t of tags) {
    drawText(g, t.text, cx, y, tagColor(t.state), { small: true })
    cx += textWidth(t.text, 1, true) + 10
  }
}

function feedAll(state: GameState, buildingId: string): ActionResult {
  let s = state
  let fed = 0
  let lastMessage = 'THERE IS NOTHING TO FEED HERE.'
  for (const a of animalsIn(state, buildingId)) {
    const r = feedAnimal(s, a.id)
    s = r.state
    lastMessage = r.message
    if (r.ok) fed += 1
  }
  if (fed === 0) return { state: s, ok: false, message: lastMessage, sound: 'deny', fx: [] }
  return {
    state: s,
    ok: true,
    message: `FED ${fed} ANIMAL${fed === 1 ? '' : 'S'}.`,
    sound: 'plant',
    fx: [],
  }
}

function collectAll(state: GameState, buildingId: string): ActionResult {
  let s = state
  let count = 0
  let lastMessage = 'THERE IS NOTHING TO COLLECT HERE.'
  for (const a of animalsIn(state, buildingId)) {
    const r = collectProduce(s, a.id)
    s = r.state
    lastMessage = r.message
    if (r.ok) count += 1
  }
  if (count === 0) return { state: s, ok: false, message: lastMessage, sound: 'deny', fx: [] }
  return {
    state: s,
    ok: true,
    message: `COLLECTED FROM ${count} ANIMAL${count === 1 ? '' : 'S'}.`,
    sound: 'harvest',
    fx: [],
  }
}

function produceTag(state: GameState, species: SpeciesDef, animal: Animal, young: boolean): Tag {
  if (species.produces.length === 0) return { text: 'NO PRODUCE', state: 'off' }
  if (isProduceReady(state, animal)) return { text: 'PRODUCE READY', state: 'on' }
  if (young) return { text: `TOO YOUNG - ${animal.daysUntilProduce}D`, state: 'off' }
  if (animal.daysUntilProduce > 0) return { text: `${animal.daysUntilProduce}D TO GO`, state: 'off' }
  return { text: 'NOTHING TODAY', state: 'off' }
}

function buildRows(
  state: GameState,
  buildingId: string,
  take: (result: ActionResult) => void,
): Row[] {
  const rows: Row[] = []
  for (const animal of animalsIn(state, buildingId)) {
    const species = speciesById(animal.species)
    // The livestock table is static and every animal is bought against it, so this
    // should never miss — but a row that silently vanished would be worse than one
    // that is merely skipped.
    if (species === undefined) continue

    const young = animal.age < ageInDays(species.id)
    const tags: Tag[] = [
      { text: animal.fedToday ? 'FED' : 'NOT FED', state: animal.fedToday ? 'on' : 'off' },
      { text: animal.pettedToday ? 'PETTED' : 'NOT PETTED', state: animal.pettedToday ? 'on' : 'off' },
      produceTag(state, species, animal, young),
    ]
    if (young) tags.push({ text: 'YOUNG', state: 'off' })
    if (animal.unwell) tags.push({ text: 'UNWELL', state: 'warn' })

    const actions: Action[] = [
      {
        label: 'FEED',
        x: ACT_X[0],
        w: ACT_W,
        disabled: animal.fedToday,
        run: () => {
          take(feedAnimal(state, animal.id))
          return null
        },
      },
      {
        label: 'PET',
        x: ACT_X[1],
        w: ACT_W,
        disabled: animal.pettedToday,
        run: () => {
          take(petAnimal(state, animal.id))
          return null
        },
      },
      {
        label: 'COLLECT',
        x: ACT_X[2],
        w: ACT_W,
        disabled: !isProduceReady(state, animal),
        run: () => {
          take(collectProduce(state, animal.id))
          return null
        },
      },
      {
        label: animal.outside ? 'OUTSIDE' : 'LET OUT',
        x: ACT_X[3],
        w: ACT_W,
        disabled: animal.outside,
        run: () => {
          take(letOut(state, animal.id))
          return null
        },
      },
    ]

    const name = animal.name.trim().length > 0 ? animal.name.trim().toUpperCase() : 'UNNAMED'
    rows.push({
      species,
      animal,
      title: `${name} - ${species.name}`,
      tags,
      actions,
      spoken: `${name} the ${species.name}, friendship ${animal.friendship} of 1000, ${friendshipLabel(animal.friendship)}.`,
    })
  }
  return rows
}

/* ------------------------------------------------------------------ scene */

export function createBuildingScene(buildingId: string): Scene {
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
    id: 'building',

    update(ctx: SceneContext, input, _ui, dt, frame): SceneCommand | null {
      ctx.tick(dt, frame)
      const g = ctx.g

      const building = ctx.state.buildings.find((b) => b.id === buildingId)
      if (building === undefined) return { kind: 'pop' }

      const def = buildingDef(building.kind)
      const name = def !== undefined ? def.name : building.kind.toUpperCase()
      const capacity = def !== undefined ? def.capacity : 0

      const state = ctx.state
      const p = input.pointer

      const results: ActionResult[] = []
      const take = (result: ActionResult): void => {
        results.push(result)
      }

      const rows = buildRows(state, buildingId, take)

      const footActions: Action[] = [
        {
          label: 'FEED ALL',
          x: INNER_X,
          w: FOOT_W,
          disabled: rows.length === 0,
          run: () => {
            take(feedAll(state, buildingId))
            return null
          },
        },
        {
          label: 'COLLECT ALL',
          x: INNER_X + FOOT_W + FOOT_GAP,
          w: FOOT_W,
          disabled: rows.length === 0,
          run: () => {
            take(collectAll(state, buildingId))
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
      drawTextCentered(g, name, PANEL_X + PANEL_W / 2, PANEL_Y + 14, PAL.ink)

      const occupancy = `${rows.length} / ${capacity}`
      drawText(g, `HOME TO ${occupancy}`, INNER_X, SUB_Y, QUIET)

      const cap = hayCapacity(state)
      const hayText =
        cap > 0
          ? `HAY IN THE SILO: ${Math.floor(state.hay)} / ${cap}`
          : `HAY IN THE SILO: ${Math.floor(state.hay)} - NO SILO BUILT`
      drawText(g, hayText, INNER_R - textWidth(hayText), SUB_Y, QUIET)
      hline(g, INNER_X, RULE_Y, INNER_R - INNER_X, PAL.bark)

      // ---- rows ------------------------------------------------------------
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

        drawAnimalIcon(g, row.species, ICON_X, ry + (ROW_H - 32) / 2)
        drawText(g, row.title, NAME_X, ry + 2, PAL.ink, { maxWidth: HEART_X - 8 - NAME_X })

        const afterHearts = drawHearts(g, HEART_X, ry + 3, row.animal.friendship)
        const friendText = `${row.animal.friendship}/1000`
        drawText(g, friendText, afterHearts + 4, ry + 2, QUIET, { small: true })

        drawTags(g, row.tags.slice(0, 2), NAME_X, ry + 17)
        drawTags(g, row.tags.slice(2), NAME_X, ry + 31)

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
        drawTextCentered(g, 'NOTHING LIVES HERE YET.', PANEL_X + PANEL_W / 2, ROW_Y + 20, PAL.ink)
        drawTextCentered(g, 'BUY ANIMALS AT THE SHOP.', PANEL_X + PANEL_W / 2, ROW_Y + 40, QUIET)
      }

      if (cursor !== spokenRow) {
        spokenRow = cursor
        const row = rows[cursor]
        ctx.announce(row === undefined ? `THE ${name}, EMPTY.` : row.spoken)
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
