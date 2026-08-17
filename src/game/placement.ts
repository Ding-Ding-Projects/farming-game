/**
 * Free-form building placement — `docs/GAMEPLAY.md` §1.
 *
 * The player enters placement mode from the shop, a ghost footprint follows the cursor,
 * and the build commits only when every rule passes. `canPlace` therefore returns a
 * **per-tile** verdict rather than a boolean: the ghost tints each tile individually so
 * the player can see *which* corner is the problem, and the refusal names the reason.
 *
 * Nothing is spent until `placeBuilding` succeeds — a cancelled placement costs nothing.
 *
 * Pure, per `docs/ARCHITECTURE.md`: no canvas, no DOM, no clock, no `Math.random`. There
 * is no randomness here at all — every tie (which building rehouses an animal, which id
 * a new building gets) is broken by array order, so a save always replays identically.
 */
import type { ActionResult, Fx, GameState, Ground, SoundId, Tile } from './types'
import type {
  Animal,
  Building,
  BuildingDef,
  BuildingKind,
  Footprint,
  PlacementCheck,
  PlacementReason,
  SpeciesDef,
  SpeciesId,
  StallSlot,
} from './farm-types'
import { FARM_W } from './constants'
import { cloneState, inBounds, isWalkable, tileIndex } from './state'
import { BARN_STORE_BONUS, STALL_SLOTS, buildingDef } from './buildings'
import { producesNothing, speciesById } from './species'
import { isTileUnlocked } from './regions'
import {
  formatMaterials,
  grantXp,
  missingMaterials,
  spendMaterials,
  xpFor,
} from './progression'

/* ------------------------------------------------------------------ constants */

/** The only ground a building may stand on. Water, rock, log and weeds are cleared first. */
const BUILDABLE: ReadonlySet<Ground> = new Set<Ground>(['grass', 'soil', 'path'])

/**
 * The farmhouse rectangle, matching the reservation `state.ts` makes during world gen.
 * Its tiles are `path`, so terrain alone would happily let a barn swallow the house.
 */
export const FARMHOUSE = { x: 1, y: 0, w: 3, h: 3 } as const

/** The doorstep, directly below the door. Kept clear so the house is never walled in. */
export const FARMHOUSE_DOOR = { x: 2, y: 3 } as const

/**
 * Moving is deliberately cheap next to rebuilding: 5 % of the build cost, floor 100G.
 * A Well moves for 100G, a Coop for 200G, a Deluxe Barn for 1,250G — an afternoon's
 * income rather than a season's, so a farm laid out badly on day three is not a
 * permanent mistake. Demolition refunds nothing, which keeps Move the right tool for
 * repositioning and stops build-and-demolish being a free way to shuffle the farm.
 */
const MOVE_FEE_RATE = 0.05
const MOVE_FEE_MIN = 100

/** Refund on tearing a building down. Zero on purpose — see `MOVE_FEE_RATE`. */
const DEMOLISH_REFUND = 0

/** Fraction of an animal's purchase price returned when a demolition sells it. */
const ANIMAL_SALE_RATE = 0.5

/**
 * Worst-first, so a footprint straddling a pond and a fence reports the pond. The order
 * matches the rule order in `docs/GAMEPLAY.md` §1.
 */
const REASON_PRIORITY: readonly PlacementReason[] = [
  'out-of-bounds',
  'locked-region',
  'terrain',
  'occupied-plant',
  'occupied-sprinkler',
  'occupied-machine',
  'occupied-building',
  'unreachable',
]

/* -------------------------------------------------------------- result helpers */

function refuse(state: GameState, message: string): ActionResult {
  return { state, ok: false, message, sound: 'deny', fx: [] }
}

function done(state: GameState, message: string, sound: SoundId, fx: Fx[]): ActionResult {
  return { state, ok: true, message, sound, fx }
}

/* --------------------------------------------------------------- def lookups */

function defOf(kind: BuildingKind): BuildingDef | null {
  return buildingDef(kind) ?? null
}

function speciesDef(id: SpeciesId): SpeciesDef | null {
  return speciesById(id) ?? null
}

function buildingName(kind: BuildingKind): string {
  const def = defOf(kind)
  return (def ? def.name : kind).toUpperCase()
}

function animalLabel(animal: Animal): string {
  const def = speciesDef(animal.species)
  const species = (def ? def.name : animal.species).toUpperCase()
  const given = animal.name.trim()
  return given.length > 0 ? given.toUpperCase() : species
}

/* ------------------------------------------------------- footprint arithmetic */

/** Tolerates a fractional or nonsense span rather than producing NaN tile indices. */
function span(n: number): number {
  return Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1
}

/** Off-map rather than NaN, so a nonsense coordinate reads as out of bounds. */
function coord(n: number): number {
  return Number.isFinite(n) ? Math.floor(n) : -1
}

/** The footprint of a placed building, or 1x1 for a kind no catalogue entry describes. */
export function footprintOf(building: Building): Footprint {
  const def = defOf(building.kind)
  return def ? { w: span(def.footprint.w), h: span(def.footprint.h) } : { w: 1, h: 1 }
}

/** Every tile index a building covers, row-major, skipping anything off the map. */
export function tilesOf(building: Building): number[] {
  const { w, h } = footprintOf(building)
  const ox = coord(building.x)
  const oy = coord(building.y)
  const out: number[] = []
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const x = ox + dx
      const y = oy + dy
      if (inBounds(x, y)) out.push(tileIndex(x, y))
    }
  }
  return out
}

/* ----------------------------------------------------------- tile occupancy */

/**
 * `docs/GAMEPLAY.md` §4 gives `Tile` a `buildingId` so occupancy is answerable per tile
 * without scanning every building, and `Tile` now carries it for real. `state.buildings`
 * stays the single source of truth: the tile field is a mirror, rebuilt wholesale after
 * every verb, and `cloneState` copies it so the mirror survives a clone and a save.
 */
function setTileBuilding(tile: Tile, id: string | null): void {
  tile.buildingId = id
}

/* --------------------------------------------------- what a building does for you */

/**
 * A building is not only walls. The Barn store adds shelves to the barn and the roadside
 * stall opens its price-it-yourself slots, and both of those live on state outside
 * `state.buildings` — so raising and pulling down have to keep them in step, or the extension
 * ladder mis-prices itself and the stall verbs refuse for a reason the player cannot see.
 */
function freshStall(): StallSlot[] {
  const slots: StallSlot[] = []
  for (let i = 0; i < STALL_SLOTS; i++) slots.push({ item: null, count: 0, price: 0, sold: 0 })
  return slots
}

function applyRaise(state: GameState, kind: BuildingKind): void {
  if (kind === 'barn-store') {
    state.progression = {
      ...state.progression,
      barnCap: state.progression.barnCap + BARN_STORE_BONUS,
    }
  }
  if (kind === 'stall' && state.stall.length === 0) state.stall = freshStall()
}

function applyRemove(state: GameState, kind: BuildingKind): void {
  if (kind === 'barn-store') {
    state.progression = {
      ...state.progression,
      barnCap: Math.max(0, state.progression.barnCap - BARN_STORE_BONUS),
    }
  }
  if (kind === 'stall' && !state.buildings.some((b) => b.kind === 'stall')) state.stall = []
}

/** Stock still sitting on the stall, so pulling it down cannot vanish it. */
function stallStock(state: GameState): number {
  let held = 0
  for (const slot of state.stall) {
    if (slot.item !== null) held += Math.max(0, slot.count)
  }
  return held
}

/** The building id mirrored onto a tile, or null. `buildingAt` is the same answer, slower. */
export function tileBuildingId(tile: Tile): string | null {
  return tile.buildingId
}

/**
 * Rewrites the whole mirror from `state.buildings`. Cheap on a 20x11 farm, and immune to
 * a clone that dropped the field — which is why placement rebuilds it wholesale at the
 * end of every verb instead of patching only the tiles it touched.
 */
function syncTileBuildings(state: GameState): void {
  for (const tile of state.tiles) {
    tile.buildingId = null
    tile.machineId = null
  }
  for (const building of state.buildings) {
    for (const index of tilesOf(building)) setTileBuilding(state.tiles[index], building.id)
  }
  for (const machine of state.machines) {
    const tile = state.tiles[machine.index]
    if (tile !== undefined) tile.machineId = machine.id
  }
}

/** Tile index -> building id, authoritative because it is built from `state.buildings`. */
function buildingTileMap(state: GameState, ignoreId: string | null): Map<number, string> {
  const map = new Map<number, string>()
  for (const building of state.buildings) {
    if (ignoreId !== null && building.id === ignoreId) continue
    for (const index of tilesOf(building)) map.set(index, building.id)
  }
  return map
}

function machineTileSet(state: GameState): Set<number> {
  const set = new Set<number>()
  for (const machine of state.machines) set.add(machine.index)
  return set
}

/** The building covering a tile, or null. */
export function buildingAt(state: GameState, index: number): Building | null {
  for (const building of state.buildings) {
    for (const covered of tilesOf(building)) {
      if (covered === index) return building
    }
  }
  return null
}

/** Everyone living in a building. */
export function animalsIn(state: GameState, buildingId: string): Animal[] {
  return state.animals.filter((animal) => animal.buildingId === buildingId)
}

export function isFarmhouseTile(x: number, y: number): boolean {
  return (
    x >= FARMHOUSE.x &&
    x < FARMHOUSE.x + FARMHOUSE.w &&
    y >= FARMHOUSE.y &&
    y < FARMHOUSE.y + FARMHOUSE.h
  )
}

function isDoorstep(x: number, y: number): boolean {
  return x === FARMHOUSE_DOOR.x && y === FARMHOUSE_DOOR.y
}

/** A tile inside a region of the valley the player has not bought yet. */
function isRegionLocked(state: GameState, x: number, y: number): boolean {
  return !isTileUnlocked(state.progression, x, y)
}

/* -------------------------------------------------------------- the verdict */

/** English for a refusal, so the ghost tooltip and the action message agree. */
export function placementMessage(reason: PlacementReason | null, name: string): string {
  switch (reason) {
    case 'out-of-bounds':
      return `THE ${name} WILL NOT FIT THERE.`
    case 'locked-region':
      return 'THAT LAND IS NOT YOURS YET.'
    case 'terrain':
      return 'CLEAR THE GROUND FIRST.'
    case 'occupied-plant':
      return 'SOMETHING IS GROWING THERE.'
    case 'occupied-sprinkler':
      return 'A SPRINKLER IS IN THE WAY.'
    case 'occupied-machine':
      return 'A MACHINE IS IN THE WAY.'
    case 'occupied-building':
      return 'SOMETHING IS ALREADY BUILT THERE.'
    case 'unreachable':
      return `YOU COULD NEVER WALK UP TO THE ${name}.`
    case null:
      return `THE ${name} FITS HERE.`
  }
}

function worstReason(reasons: Array<PlacementReason | null>): PlacementReason | null {
  for (const candidate of REASON_PRIORITY) {
    if (reasons.includes(candidate)) return candidate
  }
  return null
}

/** Why a single tile refuses the footprint, or null when it accepts it. */
function tileReason(
  state: GameState,
  x: number,
  y: number,
  buildings: Map<number, string>,
  machines: Set<number>,
): PlacementReason | null {
  if (!inBounds(x, y)) return 'out-of-bounds'
  if (isRegionLocked(state, x, y)) return 'locked-region'

  const index = tileIndex(x, y)
  const tile = state.tiles[index]
  if (tile === undefined) return 'out-of-bounds'

  if (!BUILDABLE.has(tile.ground)) return 'terrain'
  if (tile.plant !== null) return 'occupied-plant'
  if (tile.sprinkler) return 'occupied-sprinkler'
  if (machines.has(index)) return 'occupied-machine'
  if (buildings.has(index)) return 'occupied-building'
  if (isFarmhouseTile(x, y) || isDoorstep(x, y)) return 'occupied-building'
  return null
}

/** Ground the farmer can actually stand on, given a footprint that is about to exist. */
function standable(
  state: GameState,
  x: number,
  y: number,
  buildings: Map<number, string>,
  machines: Set<number>,
  covered: Set<number>,
): boolean {
  if (!inBounds(x, y)) return false
  const index = tileIndex(x, y)
  const tile = state.tiles[index]
  if (tile === undefined) return false
  if (covered.has(index)) return false
  if (!isWalkable(tile)) return false
  if (buildings.has(index)) return false
  if (machines.has(index)) return false
  if (isFarmhouseTile(x, y)) return false
  return true
}

/**
 * At least one tile of the footprint's bottom edge must be approachable, and that
 * approach tile must connect back to the farmhouse door across walkable ground. A
 * building you cannot walk up to is a bug, not a choice — and so is one fenced off
 * behind the pond. Flood-filled with the footprint already in place, because the
 * building itself may be what severs the path.
 */
function isReachable(
  state: GameState,
  ox: number,
  oy: number,
  w: number,
  h: number,
  buildings: Map<number, string>,
  machines: Set<number>,
  covered: Set<number>,
): boolean {
  const approach: number[] = []
  const ay = oy + h
  for (let dx = 0; dx < w; dx++) {
    const ax = ox + dx
    if (standable(state, ax, ay, buildings, machines, covered)) approach.push(tileIndex(ax, ay))
  }
  if (approach.length === 0) return false

  // Where "the rest of the farm" is measured from: the farmer, then the doorstep, then
  // the tiles around each. The spread matters because a farmhouse upgrade may grow over
  // the doorstep and a placement may be dropped under the farmer's own feet.
  const origins: Array<readonly [number, number]> = []
  for (const [px, py] of [
    [state.player.x, state.player.y],
    [FARMHOUSE_DOOR.x, FARMHOUSE_DOOR.y],
  ] as Array<readonly [number, number]>) {
    origins.push([px, py], [px, py + 1], [px, py - 1], [px - 1, py], [px + 1, py])
  }
  const start = origins.find(([sx, sy]) => standable(state, sx, sy, buildings, machines, covered))
  // Nowhere to start from at all: fall back to bare adjacency rather than refusing
  // every placement outright on a farm whose door is somehow walled in.
  if (start === undefined) return true

  const wanted = new Set(approach)
  const seen = new Set<number>([tileIndex(start[0], start[1])])
  const queue: number[] = [tileIndex(start[0], start[1])]
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head]
    if (wanted.has(index)) return true
    const cx = index % FARM_W
    const cy = Math.floor(index / FARM_W)
    const steps: Array<readonly [number, number]> = [
      [cx, cy - 1],
      [cx, cy + 1],
      [cx - 1, cy],
      [cx + 1, cy],
    ]
    for (const [nx, ny] of steps) {
      if (!standable(state, nx, ny, buildings, machines, covered)) continue
      const next = tileIndex(nx, ny)
      if (seen.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }
  return false
}

/**
 * The per-tile verdict. `ignoreId` lets a building be tested against the farm it is
 * already standing on, so nudging one tile sideways is not blocked by its own walls.
 */
function checkFootprint(
  state: GameState,
  footprint: Footprint,
  x: number,
  y: number,
  ignoreId: string | null,
): PlacementCheck {
  const w = span(footprint.w)
  const h = span(footprint.h)
  const ox = coord(x)
  const oy = coord(y)

  const buildings = buildingTileMap(state, ignoreId)
  const machines = machineTileSet(state)

  const tiles: PlacementCheck['tiles'] = []
  const covered = new Set<number>()
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const tx = ox + dx
      const ty = oy + dy
      const reason = tileReason(state, tx, ty, buildings, machines)
      tiles.push({ x: tx, y: ty, ok: reason === null, reason })
      if (inBounds(tx, ty)) covered.add(tileIndex(tx, ty))
    }
  }

  if (tiles.every((tile) => tile.ok)) {
    if (!isReachable(state, ox, oy, w, h, buildings, machines, covered)) {
      // Blame the bottom edge: that is the row the farmer would walk up to.
      for (let dx = 0; dx < w; dx++) {
        const at = (h - 1) * w + dx
        tiles[at] = { x: tiles[at].x, y: tiles[at].y, ok: false, reason: 'unreachable' }
      }
    }
  }

  const reason = worstReason(tiles.map((tile) => tile.reason))
  return { ok: reason === null, tiles, reason }
}

/** Per-tile verdict for a footprint dropped with its top-left corner at (x, y). */
export function canPlace(
  state: GameState,
  footprint: Footprint,
  x: number,
  y: number,
): PlacementCheck {
  return checkFootprint(state, footprint, x, y, null)
}

/* --------------------------------------------------------------- the purse */

/** Gold to lift a building and set it down again. */
export function moveFee(kind: BuildingKind): number {
  const def = defOf(kind)
  if (def === null) return MOVE_FEE_MIN
  return Math.max(MOVE_FEE_MIN, Math.round(def.cost * MOVE_FEE_RATE))
}

/**
 * Half the purchase price, which is what a demolition returns for an animal.
 *
 * Zero for an animal that has no price a demolition may put on it: an unknown species,
 * and the companion animals `docs/CATALOG.md` §3 marks as unsellable — the horse, which
 * `producesNothing` identifies from the data rather than by name. Those are not sold at
 * all; they are rehoused, and the demolition is refused when there is nowhere to put them.
 */
export function animalSaleValue(species: SpeciesId): number {
  const def = speciesDef(species)
  if (def === null || producesNothing(def)) return 0
  return Math.floor(Math.max(0, def.cost) * ANIMAL_SALE_RATE)
}

function nextBuildingId(state: GameState): string {
  const taken = new Set(state.buildings.map((building) => building.id))
  let n = state.buildings.length + 1
  while (taken.has(`bld-${n}`)) n += 1
  return `bld-${n}`
}

/* ------------------------------------------------------------------- verbs */

/**
 * The purchase commits here and nowhere earlier: a ghost the player cancels costs
 * nothing. Gold, materials and the level gate are all re-checked at the moment of the
 * build, because the ghost may have been on screen for a while.
 */
export function placeBuilding(
  state: GameState,
  kind: BuildingKind,
  x: number,
  y: number,
): ActionResult {
  if (state.passedOut) return refuse(state, 'YOU CAN BARELY STAND. GET TO BED.')

  const def = defOf(kind)
  if (def === null) return refuse(state, 'NOBODY BUILDS THOSE.')

  const name = def.name.toUpperCase()
  // The farmhouse is the only zero-cost def: it is already standing and is never sold.
  if (def.cost <= 0) return refuse(state, `THE ${name} IS NOT FOR SALE.`)
  if (state.progression.level < def.level) {
    return refuse(state, `THE ${name} NEEDS LEVEL ${def.level}.`)
  }
  if (state.gold < def.cost) {
    return refuse(state, `THE ${name} COSTS ${def.cost}G, YOU HAVE ${state.gold}G.`)
  }
  const missing = missingMaterials(state, def.materials)
  if (Object.keys(missing).length > 0) {
    return refuse(state, `THE ${name} STILL NEEDS ${formatMaterials(missing)}.`)
  }

  const check = canPlace(state, def.footprint, x, y)
  if (!check.ok) return refuse(state, placementMessage(check.reason, name))

  // Spends the materials and hands back the clone everything else is written into.
  const next = spendMaterials(state, def.materials)
  if (next === null) return refuse(state, `THE ${name} STILL NEEDS MATERIALS.`)
  next.gold -= def.cost
  next.stats = { ...next.stats, spent: next.stats.spent + def.cost }

  const building: Building = { id: nextBuildingId(next), kind: def.kind, x: coord(x), y: coord(y) }
  next.buildings = [...next.buildings, building]
  applyRaise(next, def.kind)

  const fx: Fx[] = tilesOf(building).map((index): Fx => ({ kind: 'dirt', index }))

  // XP after the build, and the mirror after the XP: levelling up clones the state again.
  const awarded = grantXp(next, xpFor('build'), 'build')
  syncTileBuildings(awarded.state)

  const last = awarded.leveled[awarded.leveled.length - 1]
  const levelled = last === undefined ? '' : ` LEVEL ${last}!`
  return done(awarded.state, `THE ${name} IS RAISED. -${def.cost}G.${levelled}`, 'buy', fx)
}

/**
 * Lifts a standing building and sets it down elsewhere for a fee. The animals inside
 * ride along — they belong to the building, not to the ground under it — and the new
 * spot is checked against the farm with this building's own walls taken away first.
 */
export function moveBuilding(state: GameState, id: string, x: number, y: number): ActionResult {
  if (state.passedOut) return refuse(state, 'YOU CAN BARELY STAND. GET TO BED.')

  const building = state.buildings.find((entry) => entry.id === id)
  if (building === undefined) return refuse(state, 'THAT BUILDING IS NOT THERE.')

  const name = buildingName(building.kind)
  const tx = coord(x)
  const ty = coord(y)
  if (building.x === tx && building.y === ty) {
    return refuse(state, `THE ${name} IS ALREADY THERE.`)
  }

  const fee = moveFee(building.kind)
  if (state.gold < fee) {
    return refuse(state, `MOVING THE ${name} COSTS ${fee}G, YOU HAVE ${state.gold}G.`)
  }

  const check = checkFootprint(state, footprintOf(building), tx, ty, building.id)
  if (!check.ok) return refuse(state, placementMessage(check.reason, name))

  const next = cloneState(state)
  next.gold -= fee
  next.stats = { ...next.stats, spent: next.stats.spent + fee }

  const moved: Building = { id: building.id, kind: building.kind, x: tx, y: ty }
  next.buildings = next.buildings.map((entry) => (entry.id === building.id ? moved : entry))
  syncTileBuildings(next)

  const fx: Fx[] = tilesOf(moved).map((index): Fx => ({ kind: 'dirt', index }))

  return done(next, `THE ${name} IS MOVED. -${fee}G.`, 'buy', fx)
}

/* --------------------------------------------------------------- demolition */

export interface DemolishRehome {
  animalId: string
  animal: string
  toBuildingId: string
  toBuilding: string
}

export interface DemolishSale {
  animalId: string
  animal: string
  gold: number
}

/**
 * Everything a demolition would do, worked out before anything is spent, so the
 * confirmation dialog can state it plainly instead of guessing.
 */
export interface DemolishPlan {
  ok: boolean
  /** The refusal, or the sentence the confirmation should show. */
  message: string
  building: Building | null
  moved: DemolishRehome[]
  sold: DemolishSale[]
  /** Gold the sales bring in. */
  gold: number
  /** Gold returned for the structure itself. Zero — tearing down is a real loss. */
  refund: number
}

/**
 * Residents are **sold at half price**, which is what the confirmation tells the player.
 * An animal that cannot be sold — one the catalogue prices at nothing, or a species this
 * build does not know — has to be rehoused instead, and if no standing building will
 * take it the whole demolition is refused rather than leaving it homeless. Nothing here
 * mutates state, so the shell can call it every frame while the dialog is open.
 */
export function demolishPlan(state: GameState, id: string): DemolishPlan {
  const empty: DemolishPlan = {
    ok: false,
    message: 'THAT BUILDING IS NOT THERE.',
    building: null,
    moved: [],
    sold: [],
    gold: 0,
    refund: DEMOLISH_REFUND,
  }

  const building = state.buildings.find((entry) => entry.id === id)
  if (building === undefined) return empty

  const name = buildingName(building.kind)
  const residents = animalsIn(state, building.id)

  // Spare capacity everywhere else, so a rehousing plan cannot overfill a coop.
  const room = new Map<string, number>()
  for (const other of state.buildings) {
    if (other.id === building.id) continue
    const def = defOf(other.kind)
    if (def === null || def.capacity <= 0) continue
    room.set(other.id, Math.max(0, def.capacity - animalsIn(state, other.id).length))
  }

  const moved: DemolishRehome[] = []
  const sold: DemolishSale[] = []
  let gold = 0

  for (const animal of residents) {
    const value = animalSaleValue(animal.species)
    if (value > 0) {
      sold.push({ animalId: animal.id, animal: animalLabel(animal), gold: value })
      gold += value
      continue
    }

    const target = state.buildings.find((other) => {
      if (other.id === building.id) return false
      const def = defOf(other.kind)
      if (def === null || !def.species.includes(animal.species)) return false
      return (room.get(other.id) ?? 0) > 0
    })
    if (target === undefined) {
      return {
        ok: false,
        message: `THERE IS NOWHERE FOR ${animalLabel(animal)} TO GO.`,
        building,
        moved: [],
        sold: [],
        gold: 0,
        refund: DEMOLISH_REFUND,
      }
    }
    room.set(target.id, (room.get(target.id) ?? 0) - 1)
    moved.push({
      animalId: animal.id,
      animal: animalLabel(animal),
      toBuildingId: target.id,
      toBuilding: buildingName(target.kind),
    })
  }

  const parts = [`THE ${name} COMES DOWN.`]
  if (sold.length > 0) {
    parts.push(`${sold.length} SOLD FOR ${gold}G.`)
  }
  if (moved.length > 0) {
    parts.push(`${moved.length} MOVED TO THE ${moved[0].toBuilding}.`)
  }
  if (sold.length === 0 && moved.length === 0 && residents.length === 0) {
    parts.push('NOBODY LIVED THERE.')
  }

  return {
    ok: true,
    message: parts.join(' '),
    building,
    moved,
    sold,
    gold,
    refund: DEMOLISH_REFUND,
  }
}

/**
 * Tears a building down. The caller is expected to show `demolishPlan` in a confirmation
 * first, but the rule itself is safe called directly: it never strands an animal with a
 * dangling `buildingId`, and it refuses outright when one would be left homeless.
 */
export function demolishBuilding(state: GameState, id: string): ActionResult {
  if (state.passedOut) return refuse(state, 'YOU CAN BARELY STAND. GET TO BED.')

  const plan = demolishPlan(state, id)
  if (!plan.ok || plan.building === null) return refuse(state, plan.message)

  const building = plan.building

  // Pulling the last stall down closes its slots, so anything still priced on it would go
  // with them. Take the stock back first — the stall is never a hole goods fall into.
  const onlyStall = building.kind === 'stall' && !state.buildings.some(
    (b) => b.kind === 'stall' && b.id !== building.id,
  )
  if (onlyStall && stallStock(state) > 0) {
    return refuse(state, 'TAKE THE STOCK OFF THE STALL BEFORE PULLING IT DOWN.')
  }

  const next = cloneState(state)

  const fx: Fx[] = tilesOf(building).map((index): Fx => ({ kind: 'pop', index }))
  next.buildings = next.buildings.filter((entry) => entry.id !== building.id)
  applyRemove(next, building.kind)
  syncTileBuildings(next)

  const soldIds = new Set(plan.sold.map((sale) => sale.animalId))
  const rehomed = new Map(plan.moved.map((move) => [move.animalId, move.toBuildingId]))
  next.animals = next.animals
    .filter((animal) => !soldIds.has(animal.id))
    .map((animal) => {
      const home = rehomed.get(animal.id)
      return home === undefined ? animal : { ...animal, buildingId: home, outside: false }
    })

  const income = plan.gold + plan.refund
  if (income > 0) {
    next.gold += income
    next.stats = { ...next.stats, earned: next.stats.earned + income }
  }

  return done(next, plan.message, income > 0 ? 'sell' : 'chop', fx)
}
