/**
 * Interiors — the inside of every building on the farm.
 *
 * `docs/INTERIORS.md` is the contract. The short version: a building is not a menu you
 * open, it is a room you walk into, and the things inside it are walked up to and used
 * exactly the way a crop row is. This module owns the shape of those rooms and decides
 * which existing verb a use means. It adds no rules of its own.
 *
 * Everything here is derived from the live `GameState` on every call and nothing is ever
 * written to the save file, so a bird bought a moment ago is already standing in its pen
 * and a machine pulled down is already off its bench.
 *
 * Pure, like the rest of `src/game`: no canvas, no DOM, no wall clock, no unseeded
 * randomness. Opening a panel is returned as a *request* the scene layer honours.
 */

import type { GameState, ActionResult, ItemRef } from './types'
import type { Animal, Building, BuildingKind, MachineKind } from './farm-types'
import { buildingDef } from './buildings'
import { SILO_HAY_CAPACITY, STALL_SLOTS } from './buildings'
import {
  animalsIn,
  collectProduce,
  feedAnimal,
  friendshipLabel,
  hayCapacity,
  isProduceReady,
  petAnimal,
} from './livestock'
import { machineDefFor, machineStatus } from './production'
import { FARMHOUSE, footprintOf } from './placement'
import { speciesById } from './species'

/* ------------------------------------------------------------------ the room */

/** What the floor of a room is made of. The art layer keys off this and nothing else. */
export type FloorId = 'plank' | 'straw' | 'stone' | 'dirt' | 'tile' | 'water' | 'soil' | 'rock'

/** What the walls are made of. */
export type WallId = 'plank' | 'plaster' | 'stone' | 'brick' | 'log' | 'glass' | 'rock' | 'metal'

export interface RoomDef {
  /** Room width in tiles, walls included. At most `FARM_W`. */
  w: number
  /** Room height in tiles, walls included. At most `FARM_H`. */
  h: number
  floor: FloorId
  wall: WallId
}

/**
 * Room size is a property of the kind, not of the footprint. A coop is four by three on the
 * farm and eleven by seven inside — the same bargain every game of this shape makes with its
 * houses. Every entry fits inside the twenty by eleven world band, which is what lets an
 * interior draw with the farm's own geometry and no camera.
 */
export const INTERIOR_ROOMS: Readonly<Record<BuildingKind, RoomDef>> = {
  farmhouse: { w: 11, h: 7, floor: 'plank', wall: 'plaster' },
  'big-farmhouse': { w: 15, h: 9, floor: 'plank', wall: 'plaster' },

  well: { w: 7, h: 5, floor: 'stone', wall: 'stone' },
  silo: { w: 9, h: 7, floor: 'plank', wall: 'metal' },
  stall: { w: 13, h: 5, floor: 'plank', wall: 'plank' },
  'barn-store': { w: 11, h: 7, floor: 'stone', wall: 'plank' },

  coop: { w: 11, h: 7, floor: 'straw', wall: 'plank' },
  'big-coop': { w: 13, h: 8, floor: 'straw', wall: 'plank' },
  'deluxe-coop': { w: 15, h: 9, floor: 'straw', wall: 'plank' },
  barn: { w: 13, h: 8, floor: 'straw', wall: 'plank' },
  'big-barn': { w: 15, h: 9, floor: 'straw', wall: 'plank' },
  'deluxe-barn': { w: 17, h: 9, floor: 'straw', wall: 'plank' },
  apiary: { w: 9, h: 7, floor: 'dirt', wall: 'plank' },
  stable: { w: 13, h: 7, floor: 'straw', wall: 'plank' },
  pond: { w: 15, h: 9, floor: 'water', wall: 'stone' },

  'sawmill-yard': { w: 13, h: 8, floor: 'dirt', wall: 'log' },
  bakery: { w: 13, h: 8, floor: 'tile', wall: 'brick' },
  workshop: { w: 13, h: 8, floor: 'stone', wall: 'plank' },
  greenhouse: { w: 15, h: 9, floor: 'soil', wall: 'glass' },
  mine: { w: 15, h: 9, floor: 'rock', wall: 'rock' },
}

/** The room a kind with no catalogue entry falls back to, so nothing is ever un-enterable. */
const DEFAULT_ROOM: RoomDef = { w: 9, h: 7, floor: 'plank', wall: 'plank' }

export function roomFor(kind: BuildingKind): RoomDef {
  return INTERIOR_ROOMS[kind] ?? DEFAULT_ROOM
}

/* --------------------------------------------------------------- the stations */

export type StationKind =
  | 'exit'
  | 'pen'
  | 'trough'
  | 'nest'
  | 'hayloft'
  | 'bench'
  | 'counter'
  | 'ledger'
  | 'bed'
  | 'chest'
  | 'crate'
  | 'shelf'
  | 'basin'
  | 'plot'

export interface Station {
  kind: StationKind
  x: number
  y: number
  /** Furniture is at least one tile and never leaves the floor rectangle. */
  w: number
  h: number
  /** Shown on the AHEAD line and spoken to the live region. Caps-led, the font is. */
  label: string
  /**
   * The thing this station stands for — an animal id, a machine id, a stall slot index as
   * a string. Null for furniture that stands for nothing but itself.
   */
  ref: string | null
  /** Solid furniture is walked up to, not through. The mat and the pond floor are not. */
  solid: boolean
}

export interface Interior {
  buildingId: string
  kind: BuildingKind
  name: string
  room: RoomDef
  /** The gap in the front wall. Standing on the mat and facing down leaves. */
  door: { x: number; y: number }
  /** The floor tile above the door — where the farmer arrives, and where they leave from. */
  mat: { x: number; y: number }
  stations: Station[]
}

/* -------------------------------------------------------------- what a room holds */

/**
 * Which machine kinds a production building is the workroom for. Standing in the bakery is
 * how a player queues every baking job in one place instead of walking to six separate
 * tiles, which is the entire reason the building is worth its price on top of the machines.
 *
 * A kind not listed here hosts nothing, and its room is a store room rather than a workroom.
 */
export const BUILDING_HOSTS: Readonly<Record<BuildingKind, readonly MachineKind[]>> = {
  bakery: ['bakery', 'pie-oven', 'popcorn-pot', 'ice-cream-maker', 'candy-machine', 'chocolate-works'],
  'sawmill-yard': ['sawmill'],
  workshop: ['loom', 'sewing-machine', 'dye-vat', 'candle-maker', 'soap-maker'],
  mine: ['smelter'],
}

export function hostedKinds(kind: BuildingKind): readonly MachineKind[] {
  return BUILDING_HOSTS[kind] ?? []
}

/* ----------------------------------------------------------------- geometry */

function clampInt(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo
  const n = Math.floor(v)
  return n < lo ? lo : n > hi ? hi : n
}

/**
 * Pen positions, left to right with a tile of straw between them, wrapping down a row at a
 * time and skipping the door column and the mat row so the way out is never furnished shut.
 *
 * Exactly `count` are produced whatever the room size: a pen that will not fit on the last
 * row is stacked back onto the first free cell rather than dropped, because a coop must
 * always show every place the player has paid for.
 */
export function penPositions(room: RoomDef, count: number, doorX: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = []
  if (count <= 0) return out

  const left = 1
  const right = room.w - 2
  const top = 1
  // The mat row stays clear, and so does the row above it, which is the walking lane.
  const bottom = room.h - 3

  for (let y = top; y <= bottom && out.length < count; y += 2) {
    for (let x = left; x <= right && out.length < count; x += 2) {
      if (x === doorX && y >= bottom - 1) continue
      out.push({ x, y })
    }
  }

  // A capacity larger than the room's tidy grid falls back to every remaining free cell.
  for (let y = top; y <= bottom && out.length < count; y++) {
    for (let x = left; x <= right && out.length < count; x++) {
      if (x === doorX && y >= bottom - 1) continue
      if (out.some((p) => p.x === x && p.y === y)) continue
      out.push({ x, y })
    }
  }

  return out
}

/* ------------------------------------------------------------------- labels */

function animalLabel(state: GameState, animal: Animal): string {
  const who = animal.name.trim().toUpperCase() || animal.species.toUpperCase()
  if (isProduceReady(state, animal)) return `${who} - SOMETHING IS READY`
  if (animal.unwell) return `${who} - UNWELL`
  if (!animal.fedToday) return `${who} - HUNGRY`
  if (!animal.pettedToday) return `${who} - ${friendshipLabel(animal.friendship)}`
  return `${who} - SETTLED`
}

function emptyPenLabel(kind: BuildingKind): string {
  const def = buildingDef(kind)
  const species = def?.species ?? []
  if (species.length === 0) return 'AN EMPTY PEN'
  const first = speciesById(species[0])
  return `AN EMPTY ${first ? first.name.toUpperCase() : 'PEN'} PLACE`
}

function benchLabel(state: GameState, machineId: string): string {
  const status = machineStatus(state, machineId)
  if (status === null) return 'AN EMPTY BENCH'
  if (status.readyCount > 0) return `${status.name} - ${status.readyCount} READY`
  if (status.active !== null) return `${status.name} - ${status.hoursLeft}H LEFT`
  return `${status.name} - IDLE`
}

function counterLabel(state: GameState, slotIndex: number): string {
  const slot = state.stall[slotIndex]
  if (slot === undefined || slot.item === null || slot.count <= 0) return `SLOT ${slotIndex + 1} - EMPTY`
  return `SLOT ${slotIndex + 1} - ${slot.count} AT ${slot.price}G`
}

/* ---------------------------------------------------------- building the room */

function pushStation(list: Station[], s: Station): void {
  list.push(s)
}

/**
 * The live interior of a placed building. Called every frame by the scene, so it does no
 * work a frame cannot afford: at most one pass over the occupants, the machines and the
 * stall slots, all of which are small.
 */
export function interiorFor(state: GameState, buildingId: string): Interior | null {
  const building =
    buildingId === FARMHOUSE_ID
      ? farmhouseBuilding()
      : state.buildings.find((b) => b.id === buildingId)
  if (building === undefined) return null

  const def = buildingDef(building.kind)
  const room = roomFor(building.kind)
  const doorX = Math.floor(room.w / 2)
  const door = { x: doorX, y: room.h - 1 }
  const mat = { x: doorX, y: room.h - 2 }

  const stations: Station[] = []
  pushStation(stations, {
    kind: 'exit',
    x: mat.x,
    y: mat.y,
    w: 1,
    h: 1,
    label: 'THE WAY OUT',
    ref: null,
    solid: false,
  })

  const capacity = def?.capacity ?? 0
  const occupants = capacity > 0 ? animalsIn(state, buildingId) : []

  if (capacity > 0) {
    const spots = penPositions(room, capacity, doorX)
    spots.forEach((spot, i) => {
      const animal = occupants[i]
      pushStation(stations, {
        kind: 'pen',
        x: spot.x,
        y: spot.y,
        w: 1,
        h: 1,
        label: animal === undefined ? emptyPenLabel(building.kind) : animalLabel(state, animal),
        ref: animal === undefined ? null : animal.id,
        solid: true,
      })
    })

    // The trough and the nest sit against the side walls, out of the walking lane, and are
    // the two verbs that act on the whole building rather than on one occupant.
    const lane = room.h - 3
    pushStation(stations, {
      kind: 'trough',
      x: 1,
      y: lane,
      w: 1,
      h: 1,
      label: `FEED TROUGH - ${occupants.filter((a) => !a.fedToday).length} HUNGRY`,
      ref: null,
      solid: true,
    })
    pushStation(stations, {
      kind: 'nest',
      x: room.w - 2,
      y: lane,
      w: 1,
      h: 1,
      label: `COLLECTING PLACE - ${occupants.filter((a) => isProduceReady(state, a)).length} READY`,
      ref: null,
      solid: true,
    })
    pushStation(stations, {
      kind: 'hayloft',
      x: room.w - 2,
      y: 1,
      w: 1,
      h: 1,
      label: `HAY - ${state.hay} OF ${hayCapacity(state)}`,
      ref: null,
      solid: true,
    })
  }

  switch (building.kind) {
    case 'farmhouse':
    case 'big-farmhouse': {
      pushStation(stations, { kind: 'bed', x: 1, y: 1, w: 2, h: 2, label: 'THE BED', ref: null, solid: true })
      pushStation(stations, {
        kind: 'chest',
        x: room.w - 2,
        y: 1,
        w: 1,
        h: 1,
        label: 'THE CHEST',
        ref: null,
        solid: true,
      })
      pushStation(stations, {
        kind: 'ledger',
        x: room.w - 2,
        y: room.h - 3,
        w: 1,
        h: 1,
        label: `THE LEDGER - ${state.orders.length} ORDERS`,
        ref: null,
        solid: true,
      })
      break
    }

    case 'well': {
      pushStation(stations, {
        kind: 'basin',
        x: doorX,
        y: 1,
        w: 1,
        h: 1,
        label: 'THE BASIN',
        ref: null,
        solid: true,
      })
      break
    }

    case 'silo': {
      pushStation(stations, {
        kind: 'hayloft',
        x: doorX,
        y: 1,
        w: 3,
        h: 2,
        label: `HAY - ${state.hay} OF ${Math.max(SILO_HAY_CAPACITY, hayCapacity(state))}`,
        ref: null,
        solid: true,
      })
      break
    }

    case 'stall': {
      // One counter per slot, along the back wall, so pricing the stall is a walk down it.
      const slots = Math.max(state.stall.length, STALL_SLOTS)
      const startX = Math.max(1, Math.floor((room.w - slots * 2 + 1) / 2))
      for (let i = 0; i < slots; i++) {
        const x = startX + i * 2
        if (x > room.w - 2) break
        pushStation(stations, {
          kind: 'counter',
          x,
          y: 1,
          w: 1,
          h: 1,
          label: counterLabel(state, i),
          ref: String(i),
          solid: true,
        })
      }
      break
    }

    case 'barn-store': {
      pushStation(stations, {
        kind: 'shelf',
        x: 1,
        y: 1,
        w: room.w - 2,
        h: 1,
        label: `SHELVES - BARN HOLDS ${state.progression.barnCap}`,
        ref: null,
        solid: true,
      })
      pushStation(stations, {
        kind: 'chest',
        x: doorX - 1,
        y: room.h - 3,
        w: 1,
        h: 1,
        label: 'THE CHEST',
        ref: null,
        solid: true,
      })
      break
    }

    case 'greenhouse': {
      // Four beds, two to a side, with the aisle down the middle the player walks.
      for (let i = 0; i < 4; i++) {
        const x = i % 2 === 0 ? 1 : room.w - 3
        const y = i < 2 ? 1 : 3
        pushStation(stations, {
          kind: 'plot',
          x,
          y,
          w: 2,
          h: 2,
          label: `BED ${i + 1} - ANY SEASON`,
          ref: String(i),
          solid: true,
        })
      }
      break
    }

    default:
      break
  }

  // Production buildings are workrooms: one bench per hosted machine standing on the farm.
  const hosts = hostedKinds(building.kind)
  if (hosts.length > 0) {
    const mine = state.machines.filter((m) => hosts.includes(m.kind))
    const startX = Math.max(1, Math.floor((room.w - mine.length * 2 + 1) / 2))
    mine.forEach((machine, i) => {
      const x = clampInt(startX + i * 2, 1, room.w - 2)
      pushStation(stations, {
        kind: 'bench',
        x,
        y: 1,
        w: 1,
        h: 1,
        label: benchLabel(state, machine.id),
        ref: machine.id,
        solid: true,
      })
    })
    if (mine.length === 0) {
      const names = hosts
        .map((k) => machineDefFor(k)?.name.toUpperCase() ?? k.toUpperCase())
        .slice(0, 2)
        .join(' OR ')
      pushStation(stations, {
        kind: 'bench',
        x: doorX,
        y: 1,
        w: 1,
        h: 1,
        label: `AN EMPTY BENCH - BUILD A ${names}`,
        ref: null,
        solid: true,
      })
    }
  }

  // Every room keeps what the building itself is holding, so no interior is ever bare.
  if (!stationsInclude(stations, 'crate') && building.kind !== 'well') {
    pushStation(stations, {
      kind: 'crate',
      x: 1,
      y: room.h - 3,
      w: 1,
      h: 1,
      label: 'A CRATE',
      ref: null,
      solid: true,
    })
  }

  return {
    buildingId,
    kind: building.kind,
    name: def?.name ?? building.kind.toUpperCase(),
    room,
    door,
    mat,
    stations: stations.filter((s) => inFloor(room, s)),
  }
}

function stationsInclude(list: Station[], kind: StationKind): boolean {
  return list.some((s) => s.kind === kind)
}

/** Furniture that would sit inside a wall is dropped rather than drawn through it. */
function inFloor(room: RoomDef, s: Station): boolean {
  if (s.kind === 'exit') return true
  return s.x >= 1 && s.y >= 1 && s.x + s.w - 1 <= room.w - 2 && s.y + s.h - 1 <= room.h - 2
}

/* -------------------------------------------------------------- walking about */

/** The station covering a room cell, or null. Furniture may be more than one tile. */
export function stationAt(interior: Interior, x: number, y: number): Station | null {
  for (const s of interior.stations) {
    if (s.kind === 'exit') continue
    if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) return s
  }
  return null
}

/** True if the farmer may stand on this room cell. Walls and solid furniture say no. */
export function isFloor(interior: Interior, x: number, y: number): boolean {
  const { room } = interior
  if (x < 1 || y < 1 || x > room.w - 2 || y > room.h - 2) return false
  const s = stationAt(interior, x, y)
  return s === null || !s.solid
}

/** Where the farmer stands on entering, which is always the mat. */
export function entryPoint(interior: Interior): { x: number; y: number } {
  return { x: interior.mat.x, y: interior.mat.y }
}

/**
 * The door tile of a placed building on the farm: the centre of its bottom row. Facing this
 * tile from the farm and using it is what takes the farmer inside.
 */
export function doorOf(building: Building): { x: number; y: number } {
  const { w, h } = footprintOf(building)
  return { x: building.x + Math.floor(w / 2), y: building.y + h - 1 }
}

/**
 * The house the farmer already lives in.
 *
 * It stands on day one and is drawn as part of the valley rather than placed by the
 * player, so it is not in `state.buildings` — and `buildingDoorAt` only ever looked
 * there. That made the farmhouse the one building nobody could walk into: it has a room
 * in `INTERIOR_ROOMS`, a case in `interiorFor`, a bed and a kitchen, and a screenshot in
 * the README, and pressing the use button at its door did nothing at all.
 *
 * Its geometry comes from `placement.FARMHOUSE` rather than from the catalogue, because
 * those two disagree — the catalogue says 4x4 while the art, the reserved tiles and the
 * doorstep all say 3x3 at (1,0). `tests/farmhouse.test.ts` holds them to the same answer.
 */
export const FARMHOUSE_ID = 'farmhouse'

/** The farmhouse as a `Building`, so every interior verb can treat it like any other. */
export function farmhouseBuilding(): Building {
  return { id: FARMHOUSE_ID, kind: 'farmhouse', x: FARMHOUSE.x, y: FARMHOUSE.y }
}

/** The tile a farmer faces to go in: the bottom-centre of the house, above the doorstep. */
export function farmhouseDoorTile(): { x: number; y: number } {
  return {
    x: FARMHOUSE.x + Math.floor(FARMHOUSE.w / 2),
    y: FARMHOUSE.y + FARMHOUSE.h - 1,
  }
}

/** The building whose door is on this farm tile, or null. */
export function buildingDoorAt(state: GameState, x: number, y: number): Building | null {
  const house = farmhouseDoorTile()
  if (x === house.x && y === house.y) return farmhouseBuilding()
  for (const b of state.buildings) {
    const d = doorOf(b)
    if (d.x === x && d.y === y) return b
  }
  return null
}

/* ------------------------------------------------------------------ using one */

/** A panel the scene should open on the player's behalf. The pure layer opens nothing. */
export type PanelRequest =
  | { open: 'recipes'; ref: string }
  | { open: 'price'; ref: string }
  | { open: 'orders' }
  | { open: 'bag' }
  | { open: 'sleep' }
  | { open: 'buy-animal'; ref: string }
  | { open: 'leave' }

export interface StationUse {
  result: ActionResult
  /** What the scene should put on screen afterwards, or null for a plain message. */
  panel: PanelRequest | null
}

function say(state: GameState, message: string, ok = false): ActionResult {
  return { state, ok, message, sound: ok ? 'select' : 'deny', fx: [] }
}

/**
 * One button, and it does the most useful pending thing. The order is fixed and published
 * in `docs/INTERIORS.md` §5: collect, then feed, then pet. Each branch calls the existing
 * verb unchanged, so every energy cost, refusal and friendship rule stays where it was.
 */
function usePen(state: GameState, animalId: string): StationUse {
  const animal = state.animals.find((a) => a.id === animalId)
  if (animal === undefined) return { result: say(state, 'THERE IS NOBODY IN THAT PEN.'), panel: null }

  if (isProduceReady(state, animal)) return { result: collectProduce(state, animalId), panel: null }
  if (!animal.fedToday) return { result: feedAnimal(state, animalId), panel: null }
  if (!animal.pettedToday) return { result: petAnimal(state, animalId), panel: null }

  const who = animal.name.trim().toUpperCase() || animal.species.toUpperCase()
  return { result: say(state, `${who} IS FED, FUSSED OVER AND HAS NOTHING WAITING.`), panel: null }
}

/**
 * Feeds everyone in the building who has not eaten. Each one goes through `feedAnimal`, so
 * the run stops the moment the farmer cannot afford the next mouth rather than feeding the
 * whole barn for one animal's energy.
 */
function useTrough(state: GameState, buildingId: string): StationUse {
  const hungry = animalsIn(state, buildingId).filter((a) => !a.fedToday)
  if (hungry.length === 0) return { result: say(state, 'EVERYONE HERE HAS EATEN TODAY.'), panel: null }

  let current = state
  let fed = 0
  let stopped = ''
  for (const animal of hungry) {
    const step = feedAnimal(current, animal.id)
    if (!step.ok) {
      stopped = step.message
      break
    }
    current = step.state
    fed += 1
  }

  if (fed === 0) return { result: say(current, stopped || 'NOBODY COULD BE FED.'), panel: null }
  const tail = stopped === '' ? '' : ` ${stopped}`
  return {
    result: {
      state: current,
      ok: true,
      message: `FED ${fed}.${tail}`,
      sound: 'harvest',
      fx: [],
    },
    panel: null,
  }
}

/** Collects everything ready in this building in one go, for the same reason. */
function useNest(state: GameState, buildingId: string): StationUse {
  const ready = animalsIn(state, buildingId).filter((a) => isProduceReady(state, a))
  if (ready.length === 0) return { result: say(state, 'NOTHING IS READY IN HERE.'), panel: null }

  let current = state
  let taken = 0
  let stopped = ''
  for (const animal of ready) {
    const step = collectProduce(current, animal.id)
    if (!step.ok) {
      stopped = step.message
      break
    }
    current = step.state
    taken += 1
  }

  if (taken === 0) return { result: say(current, stopped || 'NOTHING COULD BE COLLECTED.'), panel: null }
  const tail = stopped === '' ? '' : ` ${stopped}`
  return {
    result: {
      state: current,
      ok: true,
      message: `COLLECTED FROM ${taken}.${tail}`,
      sound: 'harvest',
      fx: [],
    },
    panel: null,
  }
}

/**
 * Uses whatever the farmer is facing inside a room. Every branch either delegates to a verb
 * that already exists or asks the scene to open a panel; none of them decide a rule here.
 */
export function useStation(state: GameState, interior: Interior, station: Station): StationUse {
  switch (station.kind) {
    case 'exit':
      return { result: say(state, 'BACK OUTSIDE.', true), panel: { open: 'leave' } }

    case 'pen':
      if (station.ref === null) {
        return { result: say(state, 'AN EMPTY PLACE. BUY SOMEBODY TO FILL IT.'), panel: { open: 'buy-animal', ref: interior.buildingId } }
      }
      return usePen(state, station.ref)

    case 'trough':
      return useTrough(state, interior.buildingId)

    case 'nest':
      return useNest(state, interior.buildingId)

    case 'hayloft':
      return {
        result: say(state, `${state.hay} HAY OF ${hayCapacity(state)}.`, true),
        panel: null,
      }

    case 'bench':
      if (station.ref === null) return { result: say(state, station.label), panel: null }
      return { result: say(state, station.label, true), panel: { open: 'recipes', ref: station.ref } }

    case 'counter':
      if (station.ref === null) return { result: say(state, 'AN EMPTY COUNTER.'), panel: null }
      return { result: say(state, station.label, true), panel: { open: 'price', ref: station.ref } }

    case 'ledger':
      return { result: say(state, 'THE ORDER BOARD.', true), panel: { open: 'orders' } }

    case 'bed':
      return { result: say(state, 'TURN IN FOR THE NIGHT.', true), panel: { open: 'sleep' } }

    case 'chest':
    case 'crate':
      return { result: say(state, 'WHAT IS IN THE BAG.', true), panel: { open: 'bag' } }

    case 'shelf':
      return { result: say(state, station.label, true), panel: null }

    case 'basin':
      return { result: say(state, 'THE WATER IS COLD AND CLEAR. THE CAN IS FULL.', true), panel: null }

    case 'plot':
      return { result: say(state, station.label, true), panel: null }
  }
}

/* -------------------------------------------------------------- what is around */

/** Everything worth reading out about a room, for the info panel and the live region. */
export interface InteriorSummary {
  occupants: number
  capacity: number
  hungry: number
  ready: number
  benches: number
  held: ItemRef[]
}

export function summarise(state: GameState, interior: Interior): InteriorSummary {
  const def = buildingDef(interior.kind)
  const occupants = animalsIn(state, interior.buildingId)
  return {
    occupants: occupants.length,
    capacity: def?.capacity ?? 0,
    hungry: occupants.filter((a) => !a.fedToday).length,
    ready: occupants.filter((a) => isProduceReady(state, a)).length,
    benches: interior.stations.filter((s) => s.kind === 'bench' && s.ref !== null).length,
    held: [],
  }
}
