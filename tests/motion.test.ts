/**
 * The 6 fps sub-clock of `docs/GRAPHICS.md` section 6, with motion left on.
 *
 * Two things are asserted, and the second is the one that rots quietly:
 *
 *  1. Ambient motion *moves* — otherwise `tests/reduced-motion.test.ts`, which proves the
 *     same draws are frozen, would pass against art that never animated at all.
 *  2. Ambient motion moves **on the beat**, not on the frame. `beatOf` divides the 60 fps
 *     counter by ten, so ten consecutive frames must be one drawing. A sprite that reads
 *     `frame` directly instead of `beatOf(frame)` still animates, still passes an
 *     eyeball check, and is running six times too fast.
 *
 * Falling weather is deliberately not in the second list: rain and snow travel on the
 * 60 fps counter because precipitation quantised to 6 fps strobes. Only the splash rings
 * inside it are on the beat.
 */
import { describe, expect, it } from 'vitest'

import { beatOf, drawGround, prefersReducedMotion } from '../src/art/tiles'
import { drawFarmhouse, drawTree, drawWeatherLayer, setAmbientFrame } from '../src/art/scenery'
import { drawAnimal } from '../src/art/livestock'
import { drawMachine } from '../src/art/structures'
import { drawPlant } from '../src/art/plants'
import { createState } from '../src/game/state'
import { requireCrop } from '../src/game/crops'
import { MACHINES } from '../src/game/factories'
import { SPECIES } from '../src/game/species'
import { Recorder, recorderCtx } from './recorder'
import type { Animal, Machine } from '../src/game/farm-types'
import type { Plant } from '../src/game/types'

function frameOf(draw: (ctx: CanvasRenderingContext2D) => void): number {
  const r = new Recorder()
  r.reset()
  draw(recorderCtx(r))
  expect(r.area, 'the draw under test painted nothing at all').toBeGreaterThan(0)
  return r.digest
}

/**
 * Asserts a draw is constant across one beat and changes on the next. `beatOf` divides
 * by ten, so frames 0-9 are beat 0 and frame 10 opens beat 1.
 */
function runsOnTheBeat(what: string, draw: (frame: number) => number): void {
  const beat0 = draw(0)
  for (let frame = 1; frame < 10; frame++) {
    expect(draw(frame), `${what} changed inside beat 0, at frame ${frame}`).toBe(beat0)
  }
  const laterBeats = new Set<number>()
  for (let beat = 1; beat < 8; beat++) laterBeats.add(draw(beat * 10))
  expect(laterBeats.size, `${what} never changed across eight beats`).toBeGreaterThan(1)
}

describe('the sub-clock', () => {
  it('is not reduced in this environment, and divides the frame counter by ten', () => {
    expect(prefersReducedMotion()).toBe(false)
    expect(beatOf(0)).toBe(0)
    expect(beatOf(9)).toBe(0)
    expect(beatOf(10)).toBe(1)
    expect(beatOf(599)).toBe(59)
  })
})

describe('ambient motion runs on the beat', () => {
  it('the water shimmer does', () => {
    const state = createState(7)
    const wet = state.tiles.find((t) => t.ground === 'water')
    expect(wet, 'the generated valley has no pond to shimmer').toBeDefined()
    runsOnTheBeat('the water shimmer', (frame) =>
      frameOf((ctx) => drawGround(ctx, wet!, 0, 0, 'spring', frame)),
    )
  })

  it('a working machine does', () => {
    for (const def of MACHINES) {
      const machine: Machine = {
        id: 'm1',
        kind: def.kind,
        index: 0,
        queue: [{ recipeId: def.recipes[0].id, quality: 'silver', hoursLeft: 4 }],
        ready: [],
      }
      runsOnTheBeat(def.kind, (frame) =>
        frameOf((ctx) => drawMachine(ctx, def, machine, 0, 0, frame)),
      )
    }
  })

  it('every animal does', () => {
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
      runsOnTheBeat(species.id, (frame) =>
        frameOf((ctx) => drawAnimal(ctx, species, animal, 0, 0, frame)),
      )
    }
  })

  it('a ripe crop sways on it', () => {
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
    runsOnTheBeat('a ripe tomato', (frame) =>
      frameOf((ctx) => drawPlant(ctx, crop, ripe, 0, 0, frame)),
    )
  })

  it('the chimney smoke and the autumn leaf fall do, through setAmbientFrame', () => {
    runsOnTheBeat('chimney smoke', (frame) => {
      setAmbientFrame(frame)
      return frameOf((ctx) => drawFarmhouse(ctx, 0, 0, 'winter', true))
    })
    runsOnTheBeat('autumn leaf fall', (frame) => {
      setAmbientFrame(frame)
      return frameOf((ctx) => drawTree(ctx, 0, 0, 'fall', 3))
    })
  })
})

describe('falling weather', () => {
  it('travels on the 60 fps counter, because 6 fps rain strobes', () => {
    for (const weather of ['rain', 'storm', 'snow'] as const) {
      const a = frameOf((ctx) => drawWeatherLayer(ctx, weather, 0))
      const b = frameOf((ctx) => drawWeatherLayer(ctx, weather, 1))
      expect(a, `${weather} is quantised to the beat`).not.toBe(b)
    }
  })
})
