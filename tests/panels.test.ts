/**
 * Captures every destination the game has, drawn by the real scene code.
 *
 * `shots.test.ts` covers the world and the interiors, which are art-layer drawings. It
 * stops at the world band on purpose, because the HUD, the tool belt and every panel are
 * drawn by the *scene* layer, which wants a live `Input` and `UI` — and the note in that
 * file said so rather than faking chrome that would not be real.
 *
 * It turns out the scene layer needs very little to run: scenes read a handful of `Input`
 * methods and a pointer, the immediate-mode `UI` holds no DOM reference at all, and both
 * of the things that would normally need a browser already fail safe — `playSound` returns immediately when
 * no `AudioContext` was ever created, and `prefersReducedMotion` guards `matchMedia` with
 * a `typeof` check. So the panels can be driven for real, with a stub that answers "no key
 * is down and the pointer is off-screen" and nothing else.
 *
 * That is what makes these captures worth having: nothing here re-draws a panel. Every
 * frame is `scene.update()` against a real `GameState`, so a panel that lays out wrongly
 * produces a wrong picture, and a panel that throws fails this test.
 *
 * Skipped unless SHOTS=1, exactly like the world captures:
 *
 *   npm run shots
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { LOGICAL_H, LOGICAL_W } from '../src/game/constants'
import { createState, tileIndex } from '../src/game/state'
import { createMarket } from '../src/game/economy'
import { createProgression } from '../src/game/progression'
import { requireCrop } from '../src/game/crops'
import { REGIONS } from '../src/game/regions'
import { ageInDays } from '../src/game/livestock'
import { SceneContext } from '../src/renderer/scene'
import { createTitleScene } from '../src/renderer/scenes/title'
import { createShopScene } from '../src/renderer/scenes/shop'
import { createInventoryScene } from '../src/renderer/scenes/inventory'
import { createHelpScene } from '../src/renderer/scenes/help'
import { createOrdersScene } from '../src/renderer/scenes/orders'
import { createMachineScene } from '../src/renderer/scenes/machine'
import { createStallScene } from '../src/renderer/scenes/stall'
import { createBuildingScene } from '../src/renderer/scenes/building'
import { createInteriorScene } from '../src/renderer/scenes/interior'
import { createWorldScene } from '../src/renderer/scenes/world'
import { setAmbientFrame } from '../src/art/scenery'
import { Raster, encodePng, survey } from './raster'
import type { Region } from './raster'
import type { Scene } from '../src/renderer/scene'
import type { Input } from '../src/engine/input'
import { UI } from '../src/engine/ui'
import type { GameState } from '../src/game/types'
import type { Animal, Building, Machine, Order } from '../src/game/farm-types'

const OUT = process.env.SHOTS_OUT ?? path.join(process.cwd(), 'docs', 'shots')
const SEED = 20260817

/* ------------------------------------------------------------------ stubs */

/**
 * The whole of the `Input` surface a scene actually reads. Every key is up and the pointer
 * is off-screen, which is the honest resting state for a capture: no phantom hover, no
 * button caught mid-press.
 */
function idleInput(): Input {
  const never = (): boolean => false
  return {
    pointer: { x: -1, y: -1, down: false, pressed: false, released: false, over: false },
    down: never,
    pressed: never,
    repeated: never,
    anyPressed: never,
    endFrame: () => {},
    dispose: () => {},
  } as unknown as Input
}

/**
 * The real immediate-mode `UI`, not a stub: it holds no DOM reference of any kind, only a
 * context and an input, so it runs here exactly as it does in the app. The title scene
 * draws its whole menu through it, which is precisely why it must be the real one.
 */
function realUi(): UI {
  return new UI()
}

/* ------------------------------------------------------------------ state */

/** A farm someone has been living on: money, level, land, and a bag with things in it. */
function established(): GameState {
  const base = createState(SEED)
  const state: GameState = {
    ...base,
    gold: 24_000,
    minutes: 11 * 60,
    buildings: [],
    animals: [],
    machines: [],
    hay: 140,
    progression: {
      ...createProgression(),
      level: 45,
      unlockedRegions: REGIONS.slice(0, 2).map((r) => r.id),
      materials: { wood: 120, stone: 90, plank: 64, nail: 40, bolt: 22, screw: 18, deed: 2 },
    },
    market: createMarket(),
    orders: [],
    loans: [],
    stall: [],
  }
  return state
}

/** Something in every pocket, so the bag capture is of a bag rather than of a grid. */
function withBag(state: GameState): GameState {
  const next = { ...state, inventory: [...state.inventory] }
  for (const id of ['potato', 'wheat', 'corn', 'tomato']) {
    const crop = requireCrop(id)
    next.inventory.push({ item: { kind: 'produce', cropId: crop.id, quality: 'normal' }, count: 24 })
    next.inventory.push({ item: { kind: 'seed', cropId: crop.id }, count: 12 })
  }
  next.inventory.push({ item: { kind: 'produce', cropId: 'potato', quality: 'gold' }, count: 6 })
  next.inventory.push({ item: { kind: 'good', goodId: 'sprinkler' }, count: 3 })
  next.inventory.push({ item: { kind: 'material', materialId: 'wood' }, count: 120 })
  next.inventory.push({ item: { kind: 'material', materialId: 'plank' }, count: 64 })
  return next
}

function raise(state: GameState, kind: string, x: number, y: number, w: number, h: number): Building {
  const b: Building = { id: `bld-${state.buildings.length + 1}`, kind, x, y }
  state.buildings.push(b)
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      const tile = state.tiles[tileIndex(x + dx, y + dy)]
      if (tile !== undefined) tile.buildingId = b.id
    }
  }
  return b
}

function beast(state: GameState, species: string, buildingId: string, over: Partial<Animal> = {}): Animal {
  const a: Animal = {
    id: `ani-${state.animals.length + 1}`,
    species,
    name: species.toUpperCase(),
    buildingId,
    age: ageInDays(species) + 12,
    friendship: 640,
    fedToday: true,
    pettedToday: false,
    daysUntilProduce: 0,
    outside: false,
    unwell: false,
    ...over,
  }
  state.animals.push(a)
  return a
}

/* ------------------------------------------------------------------ shots */

interface PanelShot {
  name: string
  scene: Scene
  state: GameState
  /** Frames to run before the capture — enough for a scene to settle its cursor. */
  warm?: number
  /** Keys to press once, one per warm frame, to reach a tab or a row. */
  keys?: string[]
  /**
   * True for a panel that sits on the scene stack over the farm. The shell keeps the
   * world underneath and only updates the top scene, so a capture that drew the panel
   * alone would show it floating on nothing — which is not what a player ever sees.
   * These captures draw the world first, exactly as the shell does.
   */
  overWorld?: boolean
}

/** Presses one key on one frame, so a capture can reach a tab without faking layout. */
function keyedInput(code: string): Input {
  const base = idleInput() as unknown as Record<string, unknown>
  return {
    ...base,
    pressed: (c: string): boolean => c === code,
    repeated: (c: string): boolean => c === code,
  } as unknown as Input
}

function panels(): PanelShot[] {
  const shots: PanelShot[] = []

  // --- the first thing anybody sees --------------------------------------
  shots.push({ name: 'panel-title', scene: createTitleScene(), state: established() })

  // --- the shop, one capture per shelf ------------------------------------
  const shopState = withBag(established())
  shopState.progression.materials = { wood: 200, stone: 150, plank: 90, nail: 60, bolt: 30, screw: 24, deed: 3 }
  raise(shopState, 'coop', 5, 1, 4, 3)
  const shelves = ['STOCK', 'BUILDINGS', 'MACHINES', 'ANIMALS', 'LAND']
  shelves.forEach((shelf, i) => {
    shots.push({
      name: `panel-shop-${shelf.toLowerCase()}`,
      scene: createShopScene(),
      state: shopState,
      overWorld: true,
      warm: i + 1,
      keys: Array.from({ length: i }, () => 'Tab'),
    })
  })

  // --- the bag, full and empty --------------------------------------------
  shots.push({ name: 'panel-bag', scene: createInventoryScene(), state: withBag(established()), overWorld: true })
  shots.push({
    name: 'panel-bag-empty',
    scene: createInventoryScene(),
    state: { ...established(), inventory: [] },
    overWorld: true,
  })

  // --- the order board, its bank tab, and an empty board -------------------
  const orderState = withBag(established())
  const order: Order = {
    id: 'ord-1',
    kind: 'delivery',
    lines: [
      { item: { kind: 'produce', cropId: 'potato', quality: 'normal' }, count: 12, minQuality: 'normal' },
      { item: { kind: 'produce', cropId: 'wheat', quality: 'normal' }, count: 40, minQuality: 'normal' },
    ],
    reward: 880,
    xpReward: 60,
    materialReward: { plank: 4 },
    reputationReward: 12,
    reputationPenalty: 8,
    issuedDay: 1,
    dueDay: 6,
    accepted: true,
  }
  orderState.orders = [order, { ...order, id: 'ord-2', accepted: false, reward: 1240, dueDay: 9 }]
  orderState.market = { ...orderState.market, reputation: 420 }
  shots.push({ name: 'panel-orders', scene: createOrdersScene(), state: orderState, overWorld: true })
  shots.push({
    name: 'panel-bank',
    scene: createOrdersScene(),
    state: orderState,
    warm: 2,
    keys: ['Tab'],
    overWorld: true,
  })
  shots.push({
    name: 'panel-orders-empty',
    scene: createOrdersScene(),
    state: { ...established(), orders: [] },
    overWorld: true,
  })

  // --- a factory bench, mid-job -------------------------------------------
  const machineState = withBag(established())
  const machine: Machine = { id: 'mac-1', kind: 'bakery', index: tileIndex(8, 5), queue: [], ready: [] }
  machineState.machines = [machine]
  machineState.tiles[machine.index].machineId = machine.id
  shots.push({ name: 'panel-machine', scene: createMachineScene('mac-1'), state: machineState, overWorld: true })

  // --- the roadside stall --------------------------------------------------
  const stallState = withBag(established())
  raise(stallState, 'stall', 14, 8, 3, 2)
  stallState.stall = [0, 1, 2, 3, 4, 5].map((i) => ({
    item: i < 3 ? { kind: 'produce' as const, cropId: 'potato', quality: 'normal' as const } : null,
    count: i < 3 ? 10 + i * 4 : 0,
    price: i < 3 ? 38 + i * 5 : 0,
    sold: 0,
  }))
  shots.push({ name: 'panel-stall', scene: createStallScene(0), state: stallState, overWorld: true })

  // --- who lives in the barn, as a list -----------------------------------
  const barnState = established()
  const barn = raise(barnState, 'big-barn', 10, 1, 6, 4)
  beast(barnState, 'cow', barn.id, { daysUntilProduce: 0 })
  beast(barnState, 'cow', barn.id, { fedToday: false })
  beast(barnState, 'goat', barn.id, { daysUntilProduce: 0 })
  beast(barnState, 'sheep', barn.id, { unwell: true })
  shots.push({ name: 'panel-building-list', scene: createBuildingScene(barn.id), state: barnState, overWorld: true })

  // --- standing inside one, HUD and all ------------------------------------
  shots.push({ name: 'panel-inside-barn', scene: createInteriorScene(barn.id), state: barnState })

  // --- the controls page ---------------------------------------------------
  shots.push({ name: 'panel-help', scene: createHelpScene(), state: established(), overWorld: true })

  return shots
}

/* ------------------------------------------------------------------ tests */

/** The whole frame, HUD and belt included: these are scene captures, so nothing is faked. */
const REGION: Region = { x: 0, y: 0, w: LOGICAL_W, h: LOGICAL_H }

/**
 * Drives one shot's scene for real and returns the raster it drew into.
 *
 * Kept separate from the test body so the same shot can be drawn twice from two freshly
 * built scenes — scenes and their state are mutated as they run, so a second render has
 * to start from a new one to mean anything.
 */
function render(shot: PanelShot): Raster {
  const raster = new Raster(LOGICAL_W, LOGICAL_H)
  const ctx = new SceneContext(raster as unknown as CanvasRenderingContext2D, shot.state)
  const ui = realUi()

  // Sprites that take no frame argument read their beat from here, and fall back to wall
  // time when nothing has pinned it. Panels drawn over the farm are pinned for free,
  // because the world scene sets it as it draws — but a panel with no world underneath is
  // not, and `panel-title` was rendering a different chimney-smoke and leaf-fall phase on
  // every run. Pin it here for every shot rather than relying on a later scene to do it.
  setAmbientFrame(0)

  if (shot.overWorld === true) {
    // One frame of the real farm underneath, the way the shell stacks it.
    const world = createWorldScene()
    world.update(ctx, idleInput(), ui, 16, 6)
    // The world scene owns ctx.state while it runs; put the shot's state back so the
    // panel is drawn against the state it was built for.
    ctx.state = shot.state
  }

  const frames = Math.max(1, shot.warm ?? 1)
  for (let f = 0; f < frames; f += 1) {
    const key = shot.keys?.[f]
    const input = key === undefined ? idleInput() : keyedInput(key)
    // A scene that throws fails here rather than writing a plausible-looking frame.
    shot.scene.update(ctx, input, ui, 16, f * 3)
  }
  return raster
}

describe.skipIf(process.env.SHOTS !== '1')('panel captures', () => {
  it('renders every destination through its real scene', () => {
    fs.mkdirSync(OUT, { recursive: true })

    const region = REGION
    const seen = new Set<string>()

    for (const shot of panels()) {
      expect(seen.has(shot.name), `duplicate capture name ${shot.name}`).toBe(false)
      seen.add(shot.name)

      const raster = render(shot)
      const png = encodePng(raster, 2, region)
      fs.writeFileSync(path.join(OUT, `${shot.name}.png`), png)

      const s = survey(raster, region)
      // eslint-disable-next-line no-console
      console.log(`${shot.name}: ${png.length}b spread ${s.spread} colours ${s.colors} holes ${s.holes}`)

      // A panel is flatter than a farm and busier than a room. What matters is that it
      // drew something with real contrast, covered every pixel, and is not one flat fill.
      expect(s.spread, `${shot.name} is flat`).toBeGreaterThan(30)
      expect(s.colors, `${shot.name} has too few colours to be a real frame`).toBeGreaterThan(16)
      expect(s.holes, `${shot.name} left ${s.holes} pixels undrawn`).toBe(0)
      expect(png.length).toBeGreaterThan(2000)
    }
  })

  /**
   * Every capture must be a function of the code alone.
   *
   * A frame that differs between two runs of the same commit is not evidence of anything:
   * it turns every future review into a diff full of noise, and a real regression hides in
   * the churn. This is how `panel-title` was caught taking its ambient beat from wall time
   * — it was the one panel with no farm behind it to pin the beat, so its chimney smoke
   * and leaf fall landed on a different phase every render.
   *
   * Both sides are built from a fresh `panels()`, because scenes and their state are
   * mutated as they run; re-driving the same scene object would prove nothing.
   */
  it('draws the same bytes twice, so a capture is never noise', () => {
    const first = panels()
    const second = panels()
    expect(second).toHaveLength(first.length)

    for (let i = 0; i < first.length; i += 1) {
      expect(second[i]?.name).toBe(first[i]?.name)
      const a = encodePng(render(first[i] as PanelShot), 2, REGION)
      const b = encodePng(render(second[i] as PanelShot), 2, REGION)
      expect(b, `${first[i]?.name} is not reproducible`).toEqual(a)
    }
  })
})
