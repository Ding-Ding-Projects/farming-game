import { describe, expect, it } from 'vitest'
import {
  DAY_START,
  FARM_H,
  FARM_W,
  SAVE_VERSION,
  START_ENERGY,
  START_GOLD,
} from '../src/game/constants'
import { cropById } from '../src/game/crops'
import {
  addItem,
  cloneState,
  countItem,
  createState,
  facingIndex,
  inBounds,
  isWalkable,
  itemKey,
  itemName,
  removeItem,
  tileAt,
  tileIndex,
} from '../src/game/state'
import type { GameState, ItemRef } from '../src/game/types'

/** Every tile reachable from the player walking only over open ground. */
function reachable(state: GameState): number[] {
  const start = tileIndex(state.player.x, state.player.y)
  const seen = new Set<number>([start])
  const queue = [start]
  while (queue.length > 0) {
    const index = queue.pop()
    if (index === undefined) break
    const x = index % FARM_W
    const y = Math.floor(index / FARM_W)
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]) {
      const nx = x + dx
      const ny = y + dy
      if (!inBounds(nx, ny)) continue
      const next = tileIndex(nx, ny)
      if (seen.has(next)) continue
      const tile = state.tiles[next]
      if (tile.ground !== 'grass' && tile.ground !== 'path' && tile.ground !== 'soil') continue
      seen.add(next)
      queue.push(next)
    }
  }
  return [...seen]
}

describe('createState', () => {
  it('is deterministic for a seed', () => {
    expect(JSON.stringify(createState(2024))).toBe(JSON.stringify(createState(2024)))
    expect(JSON.stringify(createState(0))).toBe(JSON.stringify(createState(0)))
  })

  it('lays out a different farm for a different seed', () => {
    const layout = (seed: number): string => createState(seed).tiles.map((t) => t.ground).join('')
    const seen = new Set([layout(1), layout(2), layout(3), layout(4), layout(5)])
    expect(seen.size).toBe(5)
  })

  it('starts the calendar and the purse where the design says', () => {
    const state = createState(1)
    expect(state.version).toBe(SAVE_VERSION)
    expect(state.seed).toBe(1)
    expect(state.year).toBe(1)
    expect(state.season).toBe('spring')
    expect(state.day).toBe(1)
    expect(state.minutes).toBe(DAY_START)
    expect(state.gold).toBe(START_GOLD)
    expect(state.energy).toBe(START_ENERGY)
    expect(state.maxEnergy).toBe(START_ENERGY)
    expect(state.passedOut).toBe(false)
    expect(state.tiles).toHaveLength(FARM_W * FARM_H)
  })

  it('puts the farmer on a walkable, in-bounds tile', () => {
    for (let seed = 0; seed < 40; seed++) {
      const state = createState(seed)
      expect(inBounds(state.player.x, state.player.y)).toBe(true)
      const tile = tileAt(state, state.player.x, state.player.y)
      expect(tile).toBeDefined()
      if (tile) expect(isWalkable(tile)).toBe(true)
    }
  })

  it('leaves a workable cleared patch the farmer can walk to', () => {
    for (let seed = 0; seed < 40; seed++) {
      const state = createState(seed)
      const grass = reachable(state).filter((i) => state.tiles[i].ground === 'grass')
      expect(grass.length).toBeGreaterThanOrEqual(20)
      for (const index of grass) expect(state.tiles[index].plant).toBeNull()
    }
  })

  it('strews the rest of the valley with debris and a pond', () => {
    for (let seed = 0; seed < 20; seed++) {
      const grounds = createState(seed).tiles.map((t) => t.ground)
      expect(grounds.filter((g) => g === 'water').length).toBeGreaterThan(0)
      const debris = grounds.filter((g) => g === 'weeds' || g === 'rock' || g === 'log')
      expect(debris.length).toBeGreaterThan(20)
    }
  })

  it('opens the bag with sowable spring seeds and a selection', () => {
    const state = createState(7)
    const seeds = state.inventory.filter((entry) => entry.item.kind === 'seed')
    expect(seeds.length).toBeGreaterThanOrEqual(1)
    for (const entry of seeds) {
      expect(entry.count).toBeGreaterThan(0)
      if (entry.item.kind !== 'seed') continue
      const crop = cropById(entry.item.cropId)
      expect(crop).toBeDefined()
      expect(crop?.seasons).toContain('spring')
    }
    expect(state.selectedSeed).not.toBeNull()
    if (state.selectedSeed !== null) {
      expect(countItem(state, { kind: 'seed', cropId: state.selectedSeed })).toBeGreaterThan(0)
    }
  })

  it('gives every tile a drawable variant', () => {
    for (const tile of createState(3).tiles) {
      expect(Number.isInteger(tile.variant)).toBe(true)
      expect(tile.variant).toBeGreaterThanOrEqual(0)
      expect(tile.variant).toBeLessThanOrEqual(255)
    }
  })
})

describe('the grid', () => {
  it('indexes row-major', () => {
    expect(tileIndex(0, 0)).toBe(0)
    expect(tileIndex(FARM_W - 1, 0)).toBe(FARM_W - 1)
    expect(tileIndex(0, 1)).toBe(FARM_W)
    expect(tileIndex(FARM_W - 1, FARM_H - 1)).toBe(FARM_W * FARM_H - 1)
  })

  it('bounds-checks the edges', () => {
    expect(inBounds(0, 0)).toBe(true)
    expect(inBounds(FARM_W - 1, FARM_H - 1)).toBe(true)
    expect(inBounds(-1, 0)).toBe(false)
    expect(inBounds(0, -1)).toBe(false)
    expect(inBounds(FARM_W, 0)).toBe(false)
    expect(inBounds(0, FARM_H)).toBe(false)
  })

  it('tileAt returns undefined off the map', () => {
    const state = createState(1)
    expect(tileAt(state, -1, 0)).toBeUndefined()
    expect(tileAt(state, FARM_W, 0)).toBeUndefined()
    expect(tileAt(state, 2, 2)).toBe(state.tiles[tileIndex(2, 2)])
  })

  it('isWalkable blocks water, rock and log only', () => {
    const state = createState(1)
    const tile = state.tiles[0]
    for (const ground of ['grass', 'soil', 'weeds', 'path'] as const) {
      expect(isWalkable({ ...tile, ground })).toBe(true)
    }
    for (const ground of ['water', 'rock', 'log'] as const) {
      expect(isWalkable({ ...tile, ground })).toBe(false)
    }
  })
})

describe('facingIndex', () => {
  it('points at the neighbouring tile in each direction', () => {
    const state = createState(1)
    state.player.x = 5
    state.player.y = 5
    expect(facingIndex({ ...state, player: { x: 5, y: 5, facing: 'up' } })).toBe(tileIndex(5, 4))
    expect(facingIndex({ ...state, player: { x: 5, y: 5, facing: 'down' } })).toBe(tileIndex(5, 6))
    expect(facingIndex({ ...state, player: { x: 5, y: 5, facing: 'left' } })).toBe(tileIndex(4, 5))
    expect(facingIndex({ ...state, player: { x: 5, y: 5, facing: 'right' } })).toBe(tileIndex(6, 5))
  })

  it('falls back to the tile underfoot at the edge of the map', () => {
    const state = createState(1)
    expect(facingIndex({ ...state, player: { x: 0, y: 0, facing: 'up' } })).toBe(tileIndex(0, 0))
    expect(
      facingIndex({ ...state, player: { x: FARM_W - 1, y: 0, facing: 'right' } }),
    ).toBe(tileIndex(FARM_W - 1, 0))
  })
})

describe('items', () => {
  const seed: ItemRef = { kind: 'seed', cropId: 'parsnip' }
  const gold: ItemRef = { kind: 'produce', cropId: 'parsnip', quality: 'gold' }
  const normal: ItemRef = { kind: 'produce', cropId: 'parsnip', quality: 'normal' }
  const good: ItemRef = { kind: 'good', goodId: 'sprinkler' }

  it('keys each kind distinctly, and each quality separately', () => {
    const keys = [itemKey(seed), itemKey(gold), itemKey(normal), itemKey(good)]
    expect(new Set(keys).size).toBe(4)
    expect(itemKey({ kind: 'seed', cropId: 'parsnip' })).toBe(itemKey(seed))
  })

  it('names items in the caps-led voice of the font', () => {
    expect(itemName(seed)).toBe('PARSNIP SEEDS')
    expect(itemName(normal)).toBe('PARSNIP')
    expect(itemName(gold)).toBe('GOLD PARSNIP')
    expect(itemName({ kind: 'produce', cropId: 'parsnip', quality: 'silver' })).toBe(
      'SILVER PARSNIP',
    )
    expect(itemName(good)).toBe('SPRINKLER')
    expect(itemName({ kind: 'seed', cropId: 'unknown-crop' })).toBe('UNKNOWN-CROP SEEDS')
  })

  it('round-trips add, count and remove', () => {
    const start = createState(5)
    const before = countItem(start, gold)
    const added = addItem(start, gold, 4)
    expect(countItem(added, gold)).toBe(before + 4)
    expect(countItem(start, gold)).toBe(before)

    const stacked = addItem(added, gold, 3)
    expect(countItem(stacked, gold)).toBe(before + 7)
    expect(stacked.inventory.filter((e) => itemKey(e.item) === itemKey(gold))).toHaveLength(1)

    const removed = removeItem(stacked, gold, 5)
    expect(removed).not.toBeNull()
    if (removed) expect(countItem(removed, gold)).toBe(before + 2)
  })

  it('drops the entry entirely when the last one is removed', () => {
    const state = addItem(createState(5), good, 2)
    const emptied = removeItem(state, good, 2)
    expect(emptied).not.toBeNull()
    if (!emptied) return
    expect(countItem(emptied, good)).toBe(0)
    expect(emptied.inventory.some((e) => itemKey(e.item) === itemKey(good))).toBe(false)
  })

  it('returns null when the bag is short', () => {
    const state = addItem(createState(5), good, 1)
    expect(removeItem(state, good, 2)).toBeNull()
    expect(removeItem(state, gold, 1)).toBeNull()
    expect(countItem(state, good)).toBe(1)
  })

  it('ignores non-positive counts', () => {
    const state = createState(5)
    expect(countItem(addItem(state, good, 0), good)).toBe(0)
    expect(countItem(addItem(state, good, -3), good)).toBe(0)
    const nothingRemoved = removeItem(state, good, 0)
    expect(nothingRemoved).not.toBeNull()
    if (nothingRemoved) expect(nothingRemoved.inventory).toEqual(state.inventory)
  })

  it('never mutates the state it was handed', () => {
    const state = createState(5)
    const snapshot = JSON.stringify(state)
    addItem(state, good, 3)
    removeItem(state, { kind: 'seed', cropId: 'parsnip' }, 1)
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})

describe('cloneState', () => {
  it('copies every value across', () => {
    const state = addItem(createState(11), { kind: 'good', goodId: 'sprinkler' }, 2)
    state.tiles[0].plant = {
      cropId: 'parsnip',
      stage: 1,
      progress: 1,
      dry: 0,
      dead: false,
      fertilized: true,
      regrown: 0,
    }
    expect(cloneState(state)).toEqual(state)
  })

  it('is a deep clone, not a shared reference', () => {
    const state = createState(11)
    state.tiles[3].plant = {
      cropId: 'tulip',
      stage: 0,
      progress: 0,
      dry: 0,
      dead: false,
      fertilized: false,
      regrown: 0,
    }
    const copy = cloneState(state)

    expect(copy).not.toBe(state)
    expect(copy.tiles).not.toBe(state.tiles)
    expect(copy.tiles[3]).not.toBe(state.tiles[3])
    expect(copy.tiles[3].plant).not.toBe(state.tiles[3].plant)
    expect(copy.player).not.toBe(state.player)
    expect(copy.inventory).not.toBe(state.inventory)
    expect(copy.inventory[0]).not.toBe(state.inventory[0])
    expect(copy.inventory[0].item).not.toBe(state.inventory[0].item)
    expect(copy.upgrades).not.toBe(state.upgrades)
    expect(copy.stats).not.toBe(state.stats)

    const snapshot = JSON.stringify(state)
    copy.tiles[3].ground = 'water'
    if (copy.tiles[3].plant) copy.tiles[3].plant.stage = 9
    copy.player.x = 0
    copy.inventory[0].count = 999
    copy.upgrades.canRange = 2
    copy.stats.earned = 12345
    copy.gold = 0
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})
