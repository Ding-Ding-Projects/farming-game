import { describe, expect, it } from 'vitest'
import { QUALITY_MULTIPLIER, SEASONS } from '../src/game/constants'
import { CROPS } from '../src/game/crops'
import { rngFor } from '../src/game/rng'
import {
  TREES,
  growTree,
  isTreeMature,
  isTreeRipe,
  pickTree,
  plantTree,
  requireTree,
  totalMatureDays,
  treeById,
  treeFruitsIn,
  treeValue,
  treeYield,
  treesForSeason,
} from '../src/game/trees'
import { requiredLevel } from '../src/game/unlocks'
import type { Plant, Quality } from '../src/game/types'

/** docs/CATALOG.md section 2, verbatim. A lane may not drop a row. */
const CATALOGUE: readonly string[] = [
  'apple',
  'cherry',
  'peach',
  'orange',
  'lemon',
  'plum',
  'olive',
  'coconut',
  'banana',
  'mango',
  'cacao',
  'coffee',
  'blackberry',
  'raspberry',
]

const QUALITIES: Quality[] = ['normal', 'silver', 'gold']

/**
 * Walks a sapling to its first ripe crop: grown in spring, because a sapling sleeps
 * through winter, then cycled in a season the tree actually fruits in.
 */
function ripen(treeId: string, limit = 400): { plant: Plant; days: number } {
  const tree = requireTree(treeId)
  let plant = plantTree(treeId)
  let days = 0
  while (days < limit && !isTreeMature(plant, tree)) {
    plant = growTree(plant, tree, 'spring')
    days++
  }
  while (days < limit && !isTreeRipe(plant, tree)) {
    plant = growTree(plant, tree, tree.seasons[0])
    days++
  }
  return { plant, days }
}

describe('the tree table', () => {
  it('carries all fourteen perennials the catalogue names', () => {
    expect(TREES.length).toBe(14)
    for (const id of CATALOGUE) {
      expect(treeById(id), `the catalogue requires a "${id}" tree`).toBeDefined()
    }
  })

  it('gives every tree a unique id', () => {
    const ids = TREES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every tree a unique fruit colour, and none shared with a crop', () => {
    const fruits = [...CROPS, ...TREES].map((entry) => entry.art.fruit)
    const seen = new Map<string, string>()
    const clashes: string[] = []
    for (const entry of [...CROPS, ...TREES]) {
      const owner = seen.get(entry.art.fruit)
      if (owner) clashes.push(`${entry.id} shares ${entry.art.fruit} with ${owner}`)
      else seen.set(entry.art.fruit, entry.id)
    }
    expect(clashes).toEqual([])
    expect(new Set(fruits).size).toBe(fruits.length)
  })

  it('gives every tree a display name and at least one fruiting season', () => {
    for (const tree of TREES) {
      expect(tree.name.trim().length, tree.id).toBeGreaterThan(0)
      expect(tree.seasons.length, tree.id).toBeGreaterThan(0)
      for (const season of tree.seasons) {
        expect(SEASONS, `${tree.id} fruits in "${season}"`).toContain(season)
      }
    }
  })

  it('keeps something bearing in every season, winter included', () => {
    for (const season of SEASONS) {
      expect(treesForSeason(season).length, `nothing fruits in ${season}`).toBeGreaterThan(0)
    }
  })

  it('prices every sapling and every fruit above nothing', () => {
    for (const tree of TREES) {
      expect(tree.seedCost, tree.id).toBeGreaterThan(0)
      expect(tree.basePrice, tree.id).toBeGreaterThan(0)
      expect(tree.wood, tree.id).toBeGreaterThan(0)
    }
  })

  it('gates every tree on the same level the ladder publishes', () => {
    for (const tree of TREES) {
      expect(requiredLevel(`tree:${tree.id}`), tree.id).toBe(tree.level)
    }
  })

  it('never replants: every tree carries a real fruiting cycle', () => {
    for (const tree of TREES) {
      expect(tree.regrowDays, tree.id).toBeGreaterThan(0)
      expect(tree.stageDays.length, tree.id).toBeGreaterThan(0)
      expect(totalMatureDays(tree), tree.id).toBeGreaterThan(0)
    }
  })

  it('takes most of a season to mature, so the tile is a real commitment', () => {
    for (const tree of TREES) {
      expect(totalMatureDays(tree), tree.id).toBeGreaterThanOrEqual(10)
    }
  })

  it('agrees with itself about which season a tree bears in', () => {
    for (const season of SEASONS) {
      const bearing = treesForSeason(season)
      for (const tree of TREES) {
        expect(bearing.includes(tree), `${tree.id} in ${season}`).toBe(treeFruitsIn(tree, season))
      }
    }
  })

  it('grosses enough in a fruiting season to pay for its own sapling', () => {
    for (const tree of TREES) {
      const daysBearing = tree.seasons.length * 28
      const crops = Math.floor(daysBearing / tree.regrowDays)
      const gross = crops * ((tree.yieldMin + tree.yieldMax) / 2) * tree.basePrice
      expect(gross, `${tree.id} grosses ${gross} against a ${tree.seedCost} sapling`).toBeGreaterThan(
        tree.seedCost,
      )
    }
  })
})

describe('requireTree', () => {
  it('throws for an id no tree carries', () => {
    expect(() => requireTree('turnip-tree')).toThrow(/turnip-tree/)
  })

  it('hands back the row for an id that exists', () => {
    expect(requireTree('apple').id).toBe('apple')
  })
})

describe('growth', () => {
  it('starts a sapling at stage zero and not mature', () => {
    const tree = requireTree('apple')
    const plant = plantTree('apple')
    expect(plant.cropId).toBe('apple')
    expect(plant.stage).toBe(0)
    expect(isTreeMature(plant, tree)).toBe(false)
    expect(isTreeRipe(plant, tree)).toBe(false)
  })

  it('sleeps through winter, so an autumn sapling costs a dead season', () => {
    const tree = requireTree('apple')
    let plant = plantTree('apple')
    for (let i = 0; i < 60; i++) plant = growTree(plant, tree, 'winter')
    expect(plant.stage).toBe(0)
    expect(plant.progress).toBe(0)
    expect(isTreeMature(plant, tree)).toBe(false)
  })

  it('needs no watering: growth counts calendar days, not watered ones', () => {
    const tree = requireTree('apple')
    let plant = plantTree('apple')
    for (let i = 0; i < totalMatureDays(tree); i++) plant = growTree(plant, tree, 'spring')
    expect(isTreeMature(plant, tree)).toBe(true)
    expect(plant.dry).toBe(0)
    expect(plant.dead).toBe(false)
  })

  it('ripens every tree inside a plausible run of its own seasons', () => {
    for (const tree of TREES) {
      const { plant, days } = ripen(tree.id)
      expect(isTreeRipe(plant, tree), `${tree.id} never ripened in ${days} days`).toBe(true)
      expect(days).toBe(totalMatureDays(tree) + tree.regrowDays)
    }
  })

  it('does not advance the fruiting cycle out of season', () => {
    const tree = TREES.find((t) => !t.seasons.includes('spring'))
    expect(tree).toBeDefined()
    if (!tree) return
    let plant = plantTree(tree.id)
    for (let i = 0; i < totalMatureDays(tree); i++) plant = growTree(plant, tree, 'spring')
    expect(isTreeMature(plant, tree)).toBe(true)
    const held = plant
    for (let i = 0; i < 40; i++) plant = growTree(plant, tree, 'spring')
    expect(plant.progress).toBe(held.progress)
    expect(isTreeRipe(plant, tree)).toBe(false)
  })

  it('holds ripe fruit rather than letting the season turn destroy it', () => {
    const tree = requireTree('apple')
    const { plant } = ripen('apple')
    let held = plant
    for (let i = 0; i < 30; i++) held = growTree(held, tree, 'winter')
    expect(isTreeRipe(held, tree)).toBe(true)
  })

  it('leaves a dead or mismatched plant entirely alone', () => {
    const tree = requireTree('apple')
    const dead: Plant = { ...plantTree('apple'), dead: true }
    expect(growTree(dead, tree, 'spring')).toBe(dead)
    const other = plantTree('cherry')
    expect(growTree(other, tree, 'spring')).toBe(other)
    expect(isTreeMature(dead, tree)).toBe(false)
  })
})

describe('harvesting', () => {
  it('resets the cycle and counts the harvest, keeping the tile', () => {
    const tree = requireTree('apple')
    const { plant } = ripen('apple')
    const picked = pickTree(plant, tree)
    expect(picked.progress).toBe(0)
    expect(picked.regrown).toBe(1)
    expect(picked.stage).toBe(plant.stage)
    expect(isTreeMature(picked, tree)).toBe(true)
    expect(isTreeRipe(picked, tree)).toBe(false)
  })

  it('refuses to rob a tree that is not ripe', () => {
    const tree = requireTree('apple')
    const sapling = plantTree('apple')
    expect(pickTree(sapling, tree)).toBe(sapling)
  })

  it('re-ripens on its cycle, over and over, without replanting', () => {
    const tree = requireTree('apple')
    let plant = ripen('apple').plant
    for (let harvest = 1; harvest <= 4; harvest++) {
      plant = pickTree(plant, tree)
      expect(plant.regrown).toBe(harvest)
      for (let d = 0; d < tree.regrowDays; d++) plant = growTree(plant, tree, tree.seasons[0])
      expect(isTreeRipe(plant, tree)).toBe(true)
    }
  })

  it('yields inside the table range, and never fewer than the minimum', () => {
    for (const tree of TREES) {
      const plant = plantTree(tree.id)
      for (let day = 0; day < 20; day++) {
        const rand = rngFor(1234, `tree:${tree.id}:${day}`)
        const picked = treeYield(tree, plant, rand)
        expect(picked, tree.id).toBeGreaterThanOrEqual(tree.yieldMin)
        expect(picked, tree.id).toBeLessThanOrEqual(tree.yieldMax)
      }
    }
  })

  it('is deterministic for one seed, and pays an established tree more', () => {
    const tree = requireTree('apple')
    const young = plantTree('apple')
    const old: Plant = { ...young, regrown: 24 }
    const a = treeYield(tree, young, rngFor(9, 'apple:day-1'))
    const b = treeYield(tree, young, rngFor(9, 'apple:day-1'))
    expect(a).toBe(b)
    const veteran = treeYield(tree, old, rngFor(9, 'apple:day-1'))
    expect(veteran).toBe(a + 2)
  })
})

describe('treeValue', () => {
  it('scales with quality exactly as a crop does', () => {
    for (const tree of TREES) {
      for (const quality of QUALITIES) {
        expect(treeValue(tree, quality)).toBe(
          Math.floor(tree.basePrice * QUALITY_MULTIPLIER[quality]),
        )
      }
      expect(treeValue(tree, 'gold')).toBeGreaterThanOrEqual(treeValue(tree, 'silver'))
      expect(treeValue(tree, 'silver')).toBeGreaterThanOrEqual(treeValue(tree, 'normal'))
    }
  })
})
