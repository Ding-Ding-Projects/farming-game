/**
 * The farmhouse is a building you can walk into.
 *
 * It shipped for four releases as the one building nobody could enter. It has a room in
 * `INTERIOR_ROOMS`, a case in `interiorFor` that furnishes it with a bed and a kitchen,
 * and a published screenshot — and pressing the use button at its door did nothing,
 * because it is drawn as part of the valley rather than placed by the player, so it is
 * not in `state.buildings`, and `buildingDoorAt` only looked there.
 *
 * It is also the first building any player walks up to, and the only one that exists on a
 * fresh farm, so "you cannot enter buildings" was the honest description of the game.
 *
 * These tests pin the three things that were wrong or unpinned: that the door is where
 * the doorstep says it is, that facing it finds a building, and that the geometry the
 * catalogue publishes agrees with the geometry the valley actually uses.
 */
import { describe, it, expect } from 'vitest'
import { createState } from '../src/game/state'
import { FARMHOUSE, FARMHOUSE_DOOR } from '../src/game/placement'
import { buildingDef } from '../src/game/buildings'
import {
  FARMHOUSE_ID,
  buildingDoorAt,
  farmhouseBuilding,
  farmhouseDoorTile,
  interiorFor,
} from '../src/game/interiors'

describe('the farmhouse', () => {
  it('is the door directly above the doorstep', () => {
    // The farmer stands on the doorstep and faces up. If these two ever disagree, the
    // house becomes unenterable again without a single test failing anywhere else.
    const door = farmhouseDoorTile()
    expect(door.x).toBe(FARMHOUSE_DOOR.x)
    expect(door.y).toBe(FARMHOUSE_DOOR.y - 1)
  })

  it('is found by facing its door on a farm with no built buildings', () => {
    const state = createState(4242)
    expect(state.buildings).toEqual([])

    const door = farmhouseDoorTile()
    const found = buildingDoorAt(state, door.x, door.y)
    expect(found, 'facing the farmhouse door must find the farmhouse').not.toBeNull()
    expect(found?.id).toBe(FARMHOUSE_ID)
    expect(found?.kind).toBe('farmhouse')
  })

  it('is not reported at any other tile of its own footprint', () => {
    const state = createState(4242)
    const door = farmhouseDoorTile()
    for (let y = FARMHOUSE.y; y < FARMHOUSE.y + FARMHOUSE.h; y += 1) {
      for (let x = FARMHOUSE.x; x < FARMHOUSE.x + FARMHOUSE.w; x += 1) {
        if (x === door.x && y === door.y) continue
        expect(buildingDoorAt(state, x, y), `${x},${y} is a wall, not a way in`).toBeNull()
      }
    }
  })

  it('opens a real room with a way out', () => {
    const state = createState(4242)
    const interior = interiorFor(state, FARMHOUSE_ID)
    expect(interior, 'the farmhouse must have an interior').not.toBeNull()
    if (interior === null) return

    expect(interior.room.w).toBeGreaterThan(2)
    expect(interior.room.h).toBeGreaterThan(2)
    expect(interior.stations.length).toBeGreaterThan(1)
    expect(
      interior.stations.some((s) => s.kind === 'exit'),
      'a room with no way out is a trap',
    ).toBe(true)
  })

  it('sits where the valley draws it', () => {
    const house = farmhouseBuilding()
    expect(house.x).toBe(FARMHOUSE.x)
    expect(house.y).toBe(FARMHOUSE.y)
  })

  /**
   * The catalogue and the valley describe different farmhouses, on purpose, and this
   * records it so nobody "fixes" one into the other by accident.
   *
   * `BUILDINGS` publishes 4x4 because `tests/buildings.test.ts` requires an upgrade to
   * keep its footprint — `big-farmhouse` is 4x4, and an upgrade that changed size could
   * not land in place. `placement.FARMHOUSE` reserves 3x3 at (1,0), which is what
   * `art/scenery.ts` actually draws and what puts the door directly above the doorstep.
   *
   * Entry therefore takes its geometry from the placement constant and never from the
   * catalogue. Deriving the door from `footprintOf` instead would put it at (3,3) — one
   * tile diagonally off the doorstep, which is to say nowhere the farmer can reach.
   */
  it('takes its door from the valley, not from the catalogue', () => {
    const def = buildingDef('farmhouse')
    expect(def).toBeDefined()
    if (def === undefined) return

    // The two really do disagree. If they are ever reconciled this fails, which is the
    // moment to delete the special case rather than the moment to be surprised by it.
    expect(
      def.footprint.w !== FARMHOUSE.w || def.footprint.h !== FARMHOUSE.h,
      'catalogue and valley agree now — the farmhouse special case can be simplified',
    ).toBe(true)

    // What matters is that the door the game uses is the one above the doorstep.
    const door = farmhouseDoorTile()
    expect(door).toEqual({ x: FARMHOUSE_DOOR.x, y: FARMHOUSE_DOOR.y - 1 })

    const fromCatalogue = {
      x: FARMHOUSE.x + Math.floor(def.footprint.w / 2),
      y: FARMHOUSE.y + def.footprint.h - 1,
    }
    expect(fromCatalogue, 'the catalogue would put the door out of reach').not.toEqual(door)
  })
})
