/**
 * `docs/GRAPHICS.md` section 6, the half of it that is easy to get backwards:
 *
 *   "`prefers-reduced-motion` and the in-app motion setting drop every particle, every
 *    ambient sway and every glow pulse to a static frame — but **never** the walk cycle
 *    or a tool swing, because those communicate state rather than decorate it."
 *
 * The whole thing hangs on `beatOf` returning zero, so everything that reads the beat
 * freezes in one place. The trap is that freezing the beat is easy to over-apply: a walk
 * cycle driven off `beatOf` instead of off the caller's step counter would freeze too,
 * and the farmer would slide across the farm without moving their legs.
 *
 * The media query is answered before the art modules are imported, because
 * `prefersReducedMotion` probes once and caches. That is also why this lives in a file of
 * its own: no other test may run with the answer flipped.
 */
import { beforeAll, describe, expect, it } from 'vitest'

import { Recorder, recorderCtx } from './recorder'
import type { Animal, Machine } from '../src/game/farm-types'
import type { Facing, Plant, ToolId } from '../src/game/types'

type ArtTiles = typeof import('../src/art/tiles')
type ArtActors = typeof import('../src/art/actors')
type ArtPlants = typeof import('../src/art/plants')
type ArtScenery = typeof import('../src/art/scenery')
type ArtLivestock = typeof import('../src/art/livestock')
type ArtStructures = typeof import('../src/art/structures')

let tiles: ArtTiles
let actors: ArtActors
let plants: ArtPlants
let scenery: ArtScenery
let livestock: ArtLivestock
let structures: ArtStructures

beforeAll(async () => {
  const holder = globalThis as unknown as { matchMedia?: (q: string) => { matches: boolean } }
  holder.matchMedia = (query: string) => ({ matches: /prefers-reduced-motion/.test(query) })

  tiles = await import('../src/art/tiles')
  actors = await import('../src/art/actors')
  plants = await import('../src/art/plants')
  scenery = await import('../src/art/scenery')
  livestock = await import('../src/art/livestock')
  structures = await import('../src/art/structures')
})

/** The digest of one draw, so two frames can be compared without rasterising them. */
function frameOf(draw: (ctx: CanvasRenderingContext2D) => void): number {
  const r = new Recorder()
  r.reset()
  draw(recorderCtx(r))
  expect(r.area, 'the draw under test painted nothing at all').toBeGreaterThan(0)
  return r.digest
}

describe('the reduced-motion answer itself', () => {
  it('is read, and freezes the 6 fps sub-clock', () => {
    expect(tiles.prefersReducedMotion()).toBe(true)
    for (const frame of [0, 1, 10, 59, 600, 3600]) {
      expect(tiles.beatOf(frame), `beat at frame ${frame}`).toBe(0)
    }
  })
})

describe('what reduced motion must keep', () => {
  const TOOLS: ToolId[] = ['hoe', 'can', 'seeds', 'hand', 'axe', 'sprinkler', 'fertilizer']
  const FACINGS: Facing[] = ['up', 'down', 'left', 'right']

  /**
   * The four-frame cycle is contact, passing, contact, passing. Face on and from behind,
   * the two passing frames are deliberately the *same* drawing — that is how a walk cycle
   * of this length is normally built, and `FRONT_LEGS.walk1` and `walk3` are identical on
   * purpose — so those two facings show three distinct poses and the turned facings four.
   * What matters here is that reduced motion collapses it to none of them.
   */
  it('keeps the walk cycle moving, every tool, every facing', () => {
    for (const tool of TOOLS) {
      for (const facing of FACINGS) {
        const seen = new Set<number>()
        for (let step = 0; step < 4; step++) {
          seen.add(
            frameOf((ctx) => {
              actors.drawFarmerPose(ctx, facing, 0, 0, tool, { action: 'walk', frame: step })
            }),
          )
        }
        const expected = facing === 'left' || facing === 'right' ? 4 : 3
        expect(seen.size, `${tool} facing ${facing} lost its walk cycle`).toBe(expected)

        // And a walking farmer is never the standing one, or the cycle would read as a
        // slide however many frames it technically has.
        const standing = frameOf((ctx) => {
          actors.drawFarmerPose(ctx, facing, 0, 0, tool, { action: 'idle', frame: 0 })
        })
        expect(seen.has(standing), `${tool} facing ${facing} walks by standing still`).toBe(false)
      }
    }
  })

  it('keeps the three frames of a tool swing distinct', () => {
    for (const tool of TOOLS) {
      const seen = new Set<number>()
      for (let phase = 0; phase < 3; phase++) {
        seen.add(
          frameOf((ctx) => {
            actors.drawFarmerPose(ctx, 'down', 0, 0, tool, { action: 'use', frame: phase })
          }),
        )
      }
      expect(seen.size, `${tool} lost its swing`).toBe(3)
    }
  })

  it('still walks when the caller passes a raw step count to drawFarmer', () => {
    const seen = new Set<number>()
    for (let step = 1; step <= 4; step++) {
      seen.add(frameOf((ctx) => actors.drawFarmer(ctx, 'right', 0, 0, step, 'hoe')))
    }
    expect(seen.size).toBe(4)
  })
})

describe('what reduced motion must drop', () => {
  it('freezes falling weather', async () => {
    const { drawWeatherLayer } = scenery
    for (const weather of ['rain', 'storm', 'snow'] as const) {
      const a = frameOf((ctx) => drawWeatherLayer(ctx, weather, 0))
      const b = frameOf((ctx) => drawWeatherLayer(ctx, weather, 600))
      expect(a, `${weather} kept moving`).toBe(b)
    }
  })

  it('freezes the water shimmer', async () => {
    const { drawGround } = tiles
    const { createState } = await import('../src/game/state')
    const state = createState(7)
    const wet = state.tiles.find((t) => t.ground === 'water') ?? state.tiles[0]
    const a = frameOf((ctx) => drawGround(ctx, wet, 0, 0, 'spring', 0))
    const b = frameOf((ctx) => drawGround(ctx, wet, 0, 0, 'spring', 600))
    expect(a).toBe(b)
  })

  it('freezes the sway of a ripe crop', async () => {
    const { requireCrop } = await import('../src/game/crops')
    const crop = requireCrop('tomato')
    const ripe: Plant = {
      cropId: crop.id,
      stage: crop.stageDays.length,
      progress: 0,
      dry: 0,
      dead: false,
      fertilized: false,
      regrown: 0,
    }
    const a = frameOf((ctx) => plants.drawPlant(ctx, crop, ripe, 0, 0, 0))
    const b = frameOf((ctx) => plants.drawPlant(ctx, crop, ripe, 0, 0, 600))
    expect(a).toBe(b)
  })

  it('freezes a working machine and its glow pulse', async () => {
    const { MACHINES } = await import('../src/game/factories')
    for (const def of MACHINES) {
      const machine: Machine = {
        id: 'm1',
        kind: def.kind,
        index: 0,
        queue: [{ recipeId: def.recipes[0].id, quality: 'silver', hoursLeft: 4 }],
        ready: [],
      }
      const a = frameOf((ctx) => structures.drawMachine(ctx, def, machine, 0, 0, 0))
      const b = frameOf((ctx) => structures.drawMachine(ctx, def, machine, 0, 0, 600))
      expect(a, `${def.kind} kept animating`).toBe(b)
    }
  })

  it('freezes every animal', async () => {
    const { SPECIES } = await import('../src/game/species')
    for (const species of SPECIES) {
      const animal: Animal = {
        id: 'a1',
        species: species.id,
        name: 'X',
        buildingId: 'b1',
        age: 60,
        friendship: 500,
        fedToday: true,
        pettedToday: true,
        daysUntilProduce: 0,
        outside: true,
        unwell: false,
      }
      const a = frameOf((ctx) => livestock.drawAnimal(ctx, species, animal, 0, 0, 0))
      const b = frameOf((ctx) => livestock.drawAnimal(ctx, species, animal, 0, 0, 600))
      expect(a, `${species.id} kept animating`).toBe(b)
    }
  })

  it('freezes the chimney smoke and the autumn leaf fall on a scenery tree', () => {
    scenery.setAmbientFrame(0)
    const houseA = frameOf((ctx) => scenery.drawFarmhouse(ctx, 0, 0, 'winter', true))
    const treeA = frameOf((ctx) => scenery.drawTree(ctx, 0, 0, 'fall', 3))
    scenery.setAmbientFrame(600)
    const houseB = frameOf((ctx) => scenery.drawFarmhouse(ctx, 0, 0, 'winter', true))
    const treeB = frameOf((ctx) => scenery.drawTree(ctx, 0, 0, 'fall', 3))
    expect(houseA).toBe(houseB)
    expect(treeA).toBe(treeB)
  })
})
