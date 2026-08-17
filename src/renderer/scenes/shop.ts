/**
 * The general store, at 640x448.
 *
 * Three shelves behind one counter: the seasonal seed and goods stock, the building
 * catalogue and the machine catalogue. Seeds and goods change hands here and now;
 * a building or a machine is *not* bought at the counter — picking one arms a build
 * request, the panel closes, and the farm goes into the placing mode `placement.ts`
 * describes, where the ghost is lined up and the gold only leaves the purse when the
 * footprint is set down. A ghost the player cancels costs nothing, so nothing is spent
 * here either.
 *
 * The list scrolls, so the focus ring is this scene's own rather than `UI`'s: `UI`
 * tracks focus by button id, and ids that come and go as rows scroll past would move
 * the ring under the player. Row cursor, column cursor and scroll are owned here and
 * the plates are drawn to match `DESIGN.md` section 6 exactly.
 */
import type { ActionResult, GameState, ItemRef } from '../../game/types'
import type { Building, BuildingDef, MachineDef, MaterialId, SpeciesDef, SpeciesId } from '../../game/farm-types'
import type { PointerState } from '../../engine/input'
import type { Scene, SceneCommand, SceneContext } from '../scene'
import { LOGICAL_H, LOGICAL_W, WORLD_Y } from '../../game/constants'
import { countItem, itemName } from '../../game/state'
import { buy, sell, sellAllProduce, sellValue, shopStock } from '../../game/shop'
import { BUILDINGS, buildingDef } from '../../game/buildings'
import { MACHINES } from '../../game/factories'
import { machineLevel } from '../../game/production'
import { SPECIES } from '../../game/species'
import { ageInDays, animalsIn, buyAnimal, housesSpecies } from '../../game/livestock'
import { REGIONS, isFreeRegion, regionTileCount } from '../../game/regions'
import {
  buyRegion,
  expandStore,
  formatMaterials,
  isUnlocked,
  lockedNote,
  missingMaterials,
  ownsRegion,
} from '../../game/progression'
import {
  expansionCost,
  expansionTier,
  expansionUnlockId,
  expansionsLeft,
  materialCount,
  storeCapAtTier,
  storeName,
  storeSpace,
} from '../../game/storage'
import type { StoreId } from '../../game/farm-types'

/** The two stores whose caps can be paid up. `StoreId` has exactly these members. */
const STORES: readonly StoreId[] = ['silo', 'barn']
import { cropById } from '../../game/crops'
import { productById } from '../../game/products'
import { treeById } from '../../game/trees'
import { PAL, shade, withAlpha } from '../../engine/palette'
import { FONT_H, drawText, drawTextCentered, textWidth } from '../../engine/font'
import { dither, hline, outline, rect, woodPanel } from '../../engine/pixel'
import { BUTTON_INSET } from '../../engine/ui'
import { playSound } from '../../engine/audio'
import { mixHex } from '../../art/tiles'
import { drawProduceIcon, drawSeedIcon } from '../../art/plants'
import { drawGoodIcon } from '../../art/actors'
import { drawMaterialIcon, drawPlotIcon, drawProductIcon, drawShelfIcon } from '../../art/goods'
import { drawMachineIcon } from '../../art/structures'
import { drawAnimalIcon } from '../../art/livestock'

/* ------------------------------------------------------------------ *
 * The build request
 *
 * The shop cannot push the world into placing mode itself — `SceneCommand` has no
 * verb for it and the world scene owns the farm — so it leaves the choice here and
 * pops. The world scene takes it on its next frame. One slot, never a queue: a second
 * choice replaces the first, because there is only ever one ghost on the farm.
 * ------------------------------------------------------------------ */

export interface BuildRequest {
  /** `BuildingDef.kind` or `MachineDef.kind`. */
  kind: string
  /** True for a one-tile machine, false for a building with a real footprint. */
  machine: boolean
  /**
   * Set when the player is relocating a building that already stands, rather than raising
   * a new one. The ghost and the refusals are identical either way — the only difference
   * is which verb the confirmation runs, and that a move has to ignore the mover's own
   * tiles when it asks whether the ground is free.
   */
  moveId?: string
}

let armed: BuildRequest | null = null

/** Takes the armed request, if any, and disarms it. Called once per frame by the world. */
export function takeBuildRequest(): BuildRequest | null {
  const request = armed
  armed = null
  return request
}

/**
 * Arms the world's placing mode to relocate a standing building. Lives here beside the
 * build request because it is the same channel and the same ghost; a second one would
 * be a second thing to keep in step.
 */
export function armBuildingMove(id: string, kind: string): void {
  armed = { kind, machine: false, moveId: id }
}

/* ------------------------------------------------------------------ layout */

const PANEL_X = 8
const PANEL_Y = WORLD_Y + 4
const PANEL_W = LOGICAL_W - PANEL_X * 2
const PANEL_H = 344

/** Inside the 6 px wood frame and its 2 px ink outline. */
const INNER_X = PANEL_X + 16
const INNER_R = PANEL_X + PANEL_W - 16

const TAB_Y = PANEL_Y + 34
const TAB_H = 26

const ROW_Y = PANEL_Y + 74
const ROW_H = 34
const VISIBLE = 6

const ICON_X = INNER_X
const TITLE_X = INNER_X + 40
const PRICE_X = INNER_X + 246
const HELD_X = INNER_X + 322

const BTN_H = 24
const BUY_W = 44
const BUY_X = [424, 470, 516] as const
const SELL_X = 566
const SELL_W = 52
/** The single wide plate on the right of a build row, and of the footer. */
const RIGHT_X = 500
const RIGHT_W = 118
/** The animal row's "which building" selector, left of the BUY plate. */
const HOME_X = 330
const HOME_W = 160
/** The animal shelf's note has less room than the others, to leave the selector clear. */
const ANIMAL_NOTE_W = 250

const FOOT_RULE = ROW_Y + VISIBLE * ROW_H + 8
const FOOT_Y = FOOT_RULE + 8
const FOOT_H = 30

const BUY_QTY = [1, 5, 10] as const

const QUIET = mixHex(PAL.ink, PAL.parchment, 0.4)
const STRIPE = mixHex(PAL.parchment, PAL.soil, 0.1)
const CELL_EDGE = mixHex(PAL.parchment, PAL.ink, 0.3)

const TABS = ['STOCK', 'BUILDINGS', 'MACHINES', 'ANIMALS', 'LAND'] as const

const TAB_GAP = 8
/** Room kept at the right of the strip for the "1-6 OF 9" row counter. */
const TAB_TAG_W = 92
/**
 * Tab width is divided out of the strip rather than fixed, so the row counter never
 * collides with the last tab and a tab is never cut off by the panel edge. It was a fixed
 * 132 px, which fitted four shelves exactly; the fifth ran off the end of the panel and
 * straight through the counter.
 */
const TAB_W = Math.floor(
  (PANEL_W - 32 - TAB_TAG_W - TAB_GAP * (TABS.length - 1)) / TABS.length,
)
/**
 * An index into `TABS`, derived from it rather than written out.
 *
 * It used to be the literal union `0 | 1 | 2 | 3`, and the cycling below used a literal
 * `% 4`. Adding the fifth shelf therefore left it unreachable from the keyboard: Q and E
 * and Tab wrapped around the first four, and only a mouse click could reach it — and that
 * click cast an out-of-range index straight through the type. Deriving the range from the
 * table means the next shelf added is reachable the moment it exists.
 */
type TabIndex = number

/* ------------------------------------------------------------------ widgets */

interface PlateState {
  hovered: boolean
  held: boolean
  disabled: boolean
  focused: boolean
  selected: boolean
}

function inside(p: PointerState, x: number, y: number, w: number, h: number): boolean {
  return p.x >= x && p.x < x + w && p.y >= y && p.y < y + h
}

/**
 * One carved plate: `woodPanel`'s thin frame, a state fill inside it, the label in ink
 * and a cream ring when it carries the keyboard cursor. Identical in construction to
 * `UI.button` — this scene only needs its own focus model, not its own look.
 */
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
  else if (s.hovered) fill = s.selected ? shade(PAL.lantern, 0.3) : PAL.lantern
  else if (s.selected) fill = PAL.lantern
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

/** A WxH footprint diagram, so a building's size is a shape rather than a number. */
function footprintBadge(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const cell = 6
  const ox = x + Math.max(0, ((32 - w * cell) >> 1))
  const oy = y + Math.max(0, ((32 - h * cell) >> 1))
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const cx = ox + col * cell
      const cy = oy + row * cell
      rect(g, cx, cy, cell - 1, cell - 1, mixHex(PAL.parchment, PAL.bark, 0.35))
      // Light from the upper left, even on a diagram.
      hline(g, cx, cy, cell - 1, mixHex(PAL.parchment, PAL.cream, 0.7))
      outline(g, cx, cy, cell - 1, cell - 1, CELL_EDGE)
    }
  }
}

function drawEntryIcon(g: CanvasRenderingContext2D, item: ItemRef, x: number, y: number): void {
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

/* ------------------------------------------------------------------ rows */

interface Action {
  label: string
  x: number
  w: number
  disabled: boolean
  /**
   * Never called for a disabled action. Returns a command for the one plate that ends
   * the scene, so nothing has to be smuggled back out through a captured flag.
   */
  run(): SceneCommand | null
}

interface Row {
  title: string
  note: string
  /** The right-hand column, or an empty string for a row with no price of its own. */
  price: string
  priceWarn: boolean
  held: string
  locked: boolean
  icon(g: CanvasRenderingContext2D, x: number, y: number): void
  actions: Action[]
  /** What the live region says when the cursor lands on this row. */
  spoken: string
}

function materialsNote(materials: Partial<Record<MaterialId, number>>): string {
  const text = formatMaterials(materials)
  return text.length === 0 ? '' : ` + ${text}`
}

function buildingRows(ctx: SceneContext): Row[] {
  const state = ctx.state
  const level = state.progression.level
  const defs = BUILDINGS.filter((b) => b.cost > 0).slice().sort(
    (a, b) => a.level - b.level || a.cost - b.cost || a.kind.localeCompare(b.kind),
  )
  return defs.map((def: BuildingDef): Row => {
    const locked = level < def.level
    const houses = def.capacity > 0 ? ` - HOUSES ${def.capacity}` : ''
    const note = locked
      ? `NEEDS LEVEL ${def.level} - ${def.footprint.w}X${def.footprint.h}${houses}`
      : `${def.footprint.w}X${def.footprint.h}${materialsNote(def.materials)}${houses}`
    return {
      title: def.name.toUpperCase(),
      note,
      price: `${def.cost}G`,
      priceWarn: state.gold < def.cost,
      held: '',
      locked,
      icon: (g, x, y) => {
        footprintBadge(g, x, y, def.footprint.w, def.footprint.h)
      },
      actions: [
        {
          label: 'PLACE',
          x: RIGHT_X,
          w: RIGHT_W,
          disabled: locked,
          run: () => {
            armed = { kind: def.kind, machine: false }
            return null
          },
        },
      ],
      spoken: `${def.name}, ${def.cost} GOLD, ${note}`,
    }
  })
}

function machineRows(ctx: SceneContext): Row[] {
  const state = ctx.state
  const level = state.progression.level
  const defs = MACHINES.slice().sort(
    (a, b) => machineLevel(a) - machineLevel(b) || a.cost - b.cost || a.kind.localeCompare(b.kind),
  )
  return defs.map((def: MachineDef): Row => {
    const need = machineLevel(def)
    const locked = level < need
    const recipes = `${def.recipes.length} RECIPE${def.recipes.length === 1 ? '' : 'S'}`
    const note = locked
      ? `NEEDS LEVEL ${need} - ${recipes}`
      : `${recipes}${materialsNote(def.materials)}`
    return {
      title: def.name.toUpperCase(),
      note,
      price: `${def.cost}G`,
      priceWarn: state.gold < def.cost,
      held: '',
      locked,
      icon: (g, x, y) => {
        drawMachineIcon(g, def, x, y)
      },
      actions: [
        {
          label: 'PLACE',
          x: RIGHT_X,
          w: RIGHT_W,
          disabled: locked,
          run: () => {
            armed = { kind: def.kind, machine: true }
            return null
          },
        },
      ],
      spoken: `${def.name}, ${def.cost} GOLD, ${note}`,
    }
  })
}

/* ------------------------------------------------------------------ animals */

interface HomeOption {
  building: Building
  capacity: number
  /** Free stalls left in this building right now. */
  room: number
}

/** Every building on the farm that will take this species, full or not. */
function housingOptions(state: GameState, def: SpeciesDef): HomeOption[] {
  const options: HomeOption[] = []
  for (const building of state.buildings) {
    if (!housesSpecies(building.kind, def.id)) continue
    const capacity = buildingDef(building.kind)?.capacity ?? 0
    options.push({ building, capacity, room: capacity - animalsIn(state, building.id).length })
  }
  return options
}

/** What `def.produces` reads as on the shelf: the product names, or a plain "no produce". */
function producesNote(def: SpeciesDef): string {
  if (def.produces.length === 0) return 'NO PRODUCE - FOR RIDING'
  return def.produces
    .map((p) => (productById(p.productId)?.name ?? p.productId.replace(/[-_]/g, ' ').toUpperCase()))
    .join(', ')
}

/** A short, memorable pool. `buyAnimal` caps a name at twelve letters, so every entry
 * here, even with a " N" suffix for a clash, stays well inside that. */
const ANIMAL_NAMES = [
  'REX', 'DAISY', 'CLOVER', 'BISCUIT', 'PEANUT', 'MABEL', 'WALNUT', 'PATCH',
  'GINGER', 'HAZEL', 'PEBBLES', 'OLIVE', 'NUTMEG', 'PIPPIN', 'RUSTY', 'MOSSY',
  'BRAMBLE', 'SAFFRON', 'JUNIPER', 'MARIGOLD',
] as const

/** FNV-1a, so the same species and herd size always proposes the same name. */
function hashText(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * A ready-to-use name, so buying an animal is one action rather than a text field.
 * Deterministic off the herd as it stands, and bumped with a number on the rare clash
 * so `buyAnimal`'s own uniqueness check never has cause to refuse it.
 */
function defaultAnimalName(state: GameState, species: SpeciesId): string {
  const base = ANIMAL_NAMES[hashText(`${species}:${state.animals.length}`) % ANIMAL_NAMES.length]
  const taken = new Set(state.animals.map((a) => a.name.trim().toUpperCase()))
  if (!taken.has(base)) return base
  for (let n = 2; n < 100; n++) {
    const candidate = `${base} ${n}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base} ${state.animals.length}`
}

/**
 * One row per species in the catalogue, per `docs/CATALOG.md` §3. A species the player's
 * level has not reached, or that has nowhere to live, or whose homes are all full, is
 * still listed — greyed, with the exact reason on it — rather than hidden.
 */
function animalRows(
  ctx: SceneContext,
  take: (result: ActionResult) => void,
  selectedHome: Map<SpeciesId, number>,
): Row[] {
  const state = ctx.state
  const level = state.progression.level

  return SPECIES.map((def): Row => {
    const locked = level < def.level
    const homeName = buildingDef(def.housedIn[0])?.name ?? def.housedIn[0].toUpperCase()

    const options = housingOptions(state, def)
    const available = options.filter((o) => o.room > 0)
    const noHousing = options.length === 0
    const full = !noHousing && available.length === 0
    const unhoused = noHousing || full

    let homeIndex = selectedHome.get(def.id) ?? 0
    if (homeIndex < 0 || homeIndex >= available.length) homeIndex = 0
    const chosen = available[homeIndex]

    const note = locked
      ? `NEEDS LEVEL ${def.level} - ${producesNote(def)}`
      : noHousing
        ? `NO ${homeName} - ${producesNote(def)}`
        : full
          ? `${homeName} IS FULL - ${producesNote(def)}`
          : `${producesNote(def)} - ${ageInDays(def.id)} DAYS TO FIRST`

    const actions: Action[] = []
    if (available.length > 1) {
      const homeDef = buildingDef(chosen.building.kind)
      const occupied = chosen.capacity - chosen.room
      actions.push({
        label: `${homeDef?.name ?? chosen.building.kind} ${occupied}/${chosen.capacity}`,
        x: HOME_X,
        w: HOME_W,
        disabled: false,
        run: () => {
          selectedHome.set(def.id, (homeIndex + 1) % available.length)
          playSound('select')
          return null
        },
      })
    }
    actions.push({
      label: 'BUY',
      x: RIGHT_X,
      w: RIGHT_W,
      disabled: locked || unhoused || state.gold < def.cost || chosen === undefined,
      run: () => {
        if (chosen === undefined) return null
        take(buyAnimal(state, def.id, chosen.building.id, defaultAnimalName(state, def.id)))
        return null
      },
    })

    return {
      title: def.name.toUpperCase(),
      note,
      price: `${def.cost}G`,
      priceWarn: state.gold < def.cost,
      held: '',
      locked: locked || unhoused,
      icon: (g, x, y) => {
        drawAnimalIcon(g, def, x, y)
      },
      actions,
      spoken: `${def.name}, ${def.cost} GOLD, ${note}`,
    }
  })
}

/**
 * The land shelf: the plots of the valley that are still the town's, and the two stores
 * whose caps can be paid up.
 *
 * `buyRegion` and `expandStore` both had complete rules and neither had a way in, which
 * meant two thirds of the farm could never be bought and a full barn could never be made
 * bigger. A plot the player cannot afford yet is listed greyed with the exact reason —
 * level, gold or deeds — rather than hidden, because knowing what to save for is the
 * whole of the mid game.
 */
function landRows(ctx: SceneContext, take: (result: ActionResult) => void): Row[] {
  const state = ctx.state
  const rows: Row[] = []

  for (const region of REGIONS) {
    if (isFreeRegion(region)) continue
    const owned = ownsRegion(state, region.id)
    const deedsHeld = materialCount(state, 'deed')
    const tiles = regionTileCount(region)

    const deeds = (n: number): string => `${n} ${n === 1 ? 'DEED' : 'DEEDS'}`
    const reason = owned
      ? 'ALREADY YOURS'
      : state.progression.level < region.level
        ? `NEEDS LEVEL ${region.level}`
        : state.gold < region.cost
          ? `NEEDS ${region.cost}G`
          : deedsHeld < region.deeds
            ? `NEEDS ${deeds(region.deeds)}, YOU HAVE ${deedsHeld}`
            : ''

    rows.push({
      title: region.name.toUpperCase(),
      note: owned
        ? `${tiles} TILES, ALREADY CLEARED FOR WORK`
        : reason === ''
          ? `${tiles} TILES AND ${deeds(region.deeds)}`
          : `${tiles} TILES - ${reason}`,
      price: owned ? 'OWNED' : `${region.cost}G`,
      priceWarn: !owned && state.gold < region.cost,
      held: owned ? '' : `${deedsHeld} OF ${deeds(region.deeds)}`,
      locked: owned || reason !== '',
      icon: (g, x, y) => {
        drawPlotIcon(g, x, y, owned)
      },
      actions: [
        {
          label: owned ? 'OWNED' : 'BUY',
          x: RIGHT_X,
          w: RIGHT_W,
          disabled: owned || reason !== '',
          run: () => {
            take(buyRegion(state, region.id))
            return null
          },
        },
      ],
      spoken: `${region.name}, ${tiles} tiles, ${region.cost} gold. ${reason === '' ? 'AVAILABLE.' : reason}`,
    })
  }

  for (const store of STORES) {
    const { used, cap } = storeSpace(state, store)
    const left = expansionsLeft(state, store)
    const cost = expansionCost(state, store)
    const next = storeCapAtTier(store, expansionTier(state, store) + 1)
    const maxed = cost === null || left <= 0
    const short = cost === null ? {} : missingMaterials(state, cost.materials)
    const reason = maxed
      ? 'BUILT AS BIG AS IT GOES'
      : !isUnlocked(state, expansionUnlockId(store))
        ? lockedNote(expansionUnlockId(store)).toUpperCase()
        : cost !== null && state.gold < cost.gold
          ? `NEEDS ${cost.gold}G`
          : Object.keys(short).length > 0
            ? `SHORT ${formatMaterials(short)}`
            : ''

    rows.push({
      title: `${storeName(store)} SHELVES`,
      note: maxed
        ? `HOLDING ${used} OF ${cap} - ${reason}`
        : reason === ''
          ? `HOLDING ${used} OF ${cap}, PAY UP TO ${next}`
          : `HOLDING ${used} OF ${cap} - ${reason}`,
      price: maxed || cost === null ? 'DONE' : `${cost.gold}G`,
      priceWarn: !maxed && cost !== null && state.gold < cost.gold,
      held: maxed || cost === null ? '' : formatMaterials(cost.materials),
      locked: maxed || reason !== '',
      icon: (g, x, y) => {
        drawShelfIcon(g, x, y, cap === 0 ? 0 : used / cap)
      },
      actions: [
        {
          label: maxed ? 'FULL SIZE' : 'EXPAND',
          x: RIGHT_X,
          w: RIGHT_W,
          disabled: maxed || reason !== '',
          run: () => {
            take(expandStore(state, store))
            return null
          },
        },
      ],
      spoken: `${storeName(store)} shelves, holding ${used} of ${cap}. ${
        reason === '' && cost !== null ? `${cost.gold} gold to expand.` : reason
      }`,
    })
  }

  return rows
}

function stockRows(ctx: SceneContext, take: (result: ActionResult) => void): Row[] {
  const state = ctx.state
  return shopStock(state).map((entry): Row => {
    const held = countItem(state, entry.item)
    // The packet icon already says "seeds"; the row only needs the crop.
    const title =
      entry.item.kind === 'seed'
        ? (cropById(entry.item.cropId)?.name ?? itemName(entry.item)).toUpperCase()
        : itemName(entry.item).toUpperCase()

    const actions: Action[] = BUY_QTY.map((qty, q) => ({
      label: `X${qty}`,
      x: BUY_X[q],
      w: BUY_W,
      disabled: state.gold < entry.price * qty,
      run: () => {
        take(buy(state, entry.item, qty))
        return null
      },
    }))
    actions.push({
      label: 'SELL',
      x: SELL_X,
      w: SELL_W,
      disabled: held < 1 || sellValue(entry.item) <= 0,
      run: () => {
        take(sell(state, entry.item, 1))
        return null
      },
    })

    return {
      title,
      note: entry.note,
      price: `${entry.price}G`,
      priceWarn: state.gold < entry.price,
      held: held > 0 ? `HAVE ${held}` : '',
      locked: false,
      icon: (g, x, y) => {
        drawEntryIcon(g, entry.item, x, y + 4)
      },
      actions,
      spoken: `${title}, ${entry.price} gold, ${entry.note}${held > 0 ? `, ${held} held` : ''}`,
    }
  })
}

function produceTotal(ctx: SceneContext): number {
  let total = 0
  for (const entry of ctx.state.inventory) {
    if (entry.item.kind !== 'produce') continue
    total += sellValue(entry.item) * entry.count
  }
  return total
}

/* ------------------------------------------------------------------ scene */

export function createShopScene(): Scene {
  let tab: TabIndex = 0
  let cursor = 0
  let col = 0
  let scroll = 0
  let spokenRow = -1
  /** Which of a species' qualifying buildings is picked, kept across frames by species id. */
  const selectedHome = new Map<SpeciesId, number>()

  /**
   * `cursor === count` is the footer, which is a row of the list as far as the keyboard
   * is concerned — that is what keeps SELL ALL and CLOSE reachable without a mouse.
   * Only the real rows scroll.
   */
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

  const setTab = (ctx: SceneContext, next: TabIndex): void => {
    if (next < 0 || next >= TABS.length || next === tab) return
    tab = next
    cursor = 0
    col = 0
    scroll = 0
    spokenRow = -1
    playSound('select')
    ctx.announce(`${TABS[tab]} SHELF.`)
  }

  return {
    id: 'shop',

    update(ctx: SceneContext, input, _ui, dt, frame): SceneCommand | null {
      ctx.tick(dt, frame)
      const g = ctx.g
      const state = ctx.state
      const p = input.pointer

      // A list rather than a slot: a row builder hands its result back through a
      // closure, and TypeScript cannot see an assignment made inside one.
      const results: ActionResult[] = []
      const take = (result: ActionResult): void => {
        results.push(result)
      }

      const rows =
        tab === 0
          ? stockRows(ctx, take)
          : tab === 1
            ? buildingRows(ctx)
            : tab === 2
              ? machineRows(ctx)
              : tab === 3
                ? animalRows(ctx, take, selectedHome)
                : landRows(ctx, take)

      // The footer is the last row of the list. Built before the cursor is clamped so
      // its width is known to the column cursor.
      const footActions: Action[] = []
      const total = tab === 0 ? produceTotal(ctx) : 0
      if (tab === 0) {
        footActions.push({
          label: total > 0 ? `SELL ALL PRODUCE - ${total}G` : 'NO PRODUCE TO SELL',
          x: 160,
          w: 300,
          disabled: total <= 0,
          run: () => {
            take(sellAllProduce(state))
            return null
          },
        })
      }
      footActions.push({
        label: 'CLOSE',
        x: RIGHT_X,
        w: RIGHT_W,
        disabled: false,
        run: () => ({ kind: 'pop' }),
      })

      clampView(rows.length)
      const onFooter = cursor >= rows.length
      const cursorActions = onFooter ? footActions : (rows[cursor]?.actions ?? [])

      // ---- keyboard ----------------------------------------------------
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
      if (input.pressed('KeyE') || input.pressed('Tab')) {
        setTab(ctx, (tab + 1) % TABS.length)
      }
      if (input.pressed('KeyQ')) setTab(ctx, (tab + TABS.length - 1) % TABS.length)

      const activate = input.pressed('Enter') || input.pressed('NumpadEnter') || input.pressed('Space')

      // ---- panel and shelves -------------------------------------------
      woodPanel(g, PANEL_X, PANEL_Y, PANEL_W, PANEL_H)
      drawTextCentered(g, 'GENERAL STORE', PANEL_X + PANEL_W / 2, PANEL_Y + 14, PAL.ink)
      drawText(g, `${state.season.toUpperCase()} STOCK`, INNER_X, PANEL_Y + 14, QUIET)
      const purse = `${state.gold}G`
      drawText(g, purse, INNER_R - textWidth(purse), PANEL_Y + 14, PAL.ink)

      for (let t = 0; t < TABS.length; t++) {
        const tx = INNER_X + t * (TAB_W + TAB_GAP)
        const hovered = inside(p, tx, TAB_Y, TAB_W, TAB_H)
        if (p.pressed && hovered) setTab(ctx, t as TabIndex)
        plate(g, TABS[t], tx, TAB_Y, TAB_W, TAB_H, {
          hovered,
          held: hovered && p.down,
          disabled: false,
          focused: false,
          selected: t === tab,
        })
      }
      if (rows.length > VISIBLE) {
        const tag = `${scroll + 1}-${Math.min(rows.length, scroll + VISIBLE)} OF ${rows.length}`
        drawText(g, tag, INNER_R - textWidth(tag), TAB_Y + 9, QUIET)
      }
      hline(g, INNER_X, TAB_Y + TAB_H + 6, INNER_R - INNER_X, PAL.bark)

      // ---- rows --------------------------------------------------------
      let fire: Action | null = null

      for (let i = scroll; i < Math.min(rows.length, scroll + VISIBLE); i++) {
        const row = rows[i]
        const ry = ROW_Y + (i - scroll) * ROW_H
        const onRow = i === cursor
        const rowHovered = inside(p, INNER_X - 8, ry, INNER_R - INNER_X + 16, ROW_H)

        if (i % 2 === 1) rect(g, INNER_X - 8, ry, INNER_R - INNER_X + 16, ROW_H - 1, STRIPE)
        if (onRow) {
          rect(g, INNER_X - 8, ry, 3, ROW_H - 1, PAL.lantern)
          rect(g, INNER_X - 8, ry, INNER_R - INNER_X + 16, ROW_H - 1, withAlpha(PAL.lantern, 0.12))
        }
        if (rowHovered && p.pressed && cursor !== i) {
          cursor = i
          col = 0
          playSound('select')
        }

        row.icon(g, ICON_X, ry + 1)
        drawText(g, row.title, TITLE_X, ry + 4, row.locked ? QUIET : PAL.ink, { maxWidth: 190 })
        if (row.price.length > 0) {
          drawText(g, row.price, PRICE_X, ry + 4, row.priceWarn ? PAL.berry : PAL.ink)
        }
        if (row.held.length > 0) drawText(g, row.held, HELD_X, ry + 4, QUIET)
        drawText(g, row.note, TITLE_X, ry + 19, QUIET, {
          maxWidth: tab === 3 ? ANIMAL_NOTE_W : 350,
        })

        for (let a = 0; a < row.actions.length; a++) {
          const action = row.actions[a]
          const bx = action.x
          const by = ry + 5
          const hovered = !action.disabled && inside(p, bx, by, action.w, BTN_H)
          plate(g, action.label, bx, by, action.w, BTN_H, {
            hovered,
            held: hovered && p.down,
            disabled: action.disabled,
            focused: onRow && a === col,
            selected: false,
          })
          if (hovered && p.released) fire = action
          if (onRow && a === col && activate && !action.disabled) fire = action
        }
      }

      if (rows.length === 0) {
        drawTextCentered(g, 'NOTHING ON THIS SHELF.', PANEL_X + PANEL_W / 2, ROW_Y + 24, QUIET)
      }
      if (cursor !== spokenRow) {
        spokenRow = cursor
        const row = rows[cursor]
        ctx.announce(row === undefined ? 'THE COUNTER.' : row.spoken)
      }

      // ---- footer ------------------------------------------------------
      hline(g, INNER_X, FOOT_RULE, INNER_R - INNER_X, PAL.bark)
      drawText(g, 'IN THE TIN', INNER_X, FOOT_Y + 1, QUIET)
      drawText(g, purse, INNER_X, FOOT_Y + 17, PAL.ink)

      if (tab !== 0) {
        const stock = formatMaterials(state.progression.materials)
        drawText(g, 'IN THE STORE', 160, FOOT_Y + 1, QUIET)
        drawText(g, stock.length === 0 ? 'NO MATERIALS YET' : stock, 160, FOOT_Y + 17, PAL.ink, {
          maxWidth: 320,
        })
      }

      for (let a = 0; a < footActions.length; a++) {
        const action = footActions[a]
        const hovered = !action.disabled && inside(p, action.x, FOOT_Y, action.w, FOOT_H)
        plate(g, action.label, action.x, FOOT_Y, action.w, FOOT_H, {
          hovered,
          held: hovered && p.down,
          disabled: action.disabled,
          focused: onFooter && a === col,
          selected: false,
        })
        if (hovered && p.released) fire = action
        if (onFooter && a === col && activate && !action.disabled) fire = action
      }

      ctx.toastY = LOGICAL_H - 8

      // ---- act ---------------------------------------------------------
      // Run here rather than inside the draw loop, so a plate can never fire twice in
      // a frame and the state the rows were built from is still the live one.
      const command = fire === null ? null : fire.run()
      const result = results[results.length - 1]
      if (result !== undefined) {
        ctx.state = result.state
        playSound(result.sound)
        ctx.say(result.message, result.ok ? 'good' : 'bad')
      }

      // A build request means the counter is done with the player: the farm takes over.
      if (armed !== null) {
        playSound('select')
        return { kind: 'pop' }
      }

      if (command !== null) return command
      if (input.pressed('Escape') || input.pressed('KeyB')) return { kind: 'pop' }
      return null
    },
  }
}
