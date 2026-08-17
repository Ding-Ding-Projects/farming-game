import { describe, expect, it } from 'vitest'
import { CROPS } from '../src/game/crops'
import {
  MACHINES,
  allRecipes,
  machineById,
  machineForRecipe,
  machinesForLevel,
  recipeById,
  recipesForLevel,
  requireMachine,
  requireRecipe,
} from '../src/game/factories'
import {
  MATERIAL_VALUE,
  MIN_RECIPE_MARGIN,
  PRODUCTS,
  REQUIRED_CHAINS,
  chainDepth,
  chainYield,
  dominantInput,
  productById,
  productsByMachine,
  productsForLevel,
  rawInputCost,
  recipeInputCost,
  recipeOutputValue,
  recipesFor,
  recipesUsing,
  referenceValue,
  requireProduct,
  validateEconomics,
} from '../src/game/products'
import { SPECIES } from '../src/game/species'
import { TREES } from '../src/game/trees'
import { requiredLevel } from '../src/game/unlocks'
import type { MachineKind, MaterialId, Recipe } from '../src/game/farm-types'
import type { ItemRef } from '../src/game/types'

/** docs/CATALOG.md section 4. Thirty factories, and a lane may not drop a row. */
const CATALOGUE: readonly MachineKind[] = [
  'feed-mill',
  'sawmill',
  'mill',
  'dairy',
  'bakery',
  'pie-oven',
  'sugar-mill',
  'jam-maker',
  'juice-press',
  'oil-press',
  'loom',
  'sewing-machine',
  'dye-vat',
  'bbq-grill',
  'soup-kitchen',
  'salad-bar',
  'sauce-maker',
  'pasta-maker',
  'popcorn-pot',
  'ice-cream-maker',
  'candy-machine',
  'chocolate-works',
  'coffee-kiosk',
  'tea-house',
  'honey-extractor',
  'candle-maker',
  'soap-maker',
  'preserves-jar',
  'keg',
  'smelter',
]

const MATERIAL_IDS = Object.keys(MATERIAL_VALUE) as MaterialId[]

/** How an ingredient names itself, for the reachability closure. */
function inputKey(item: ItemRef): string {
  switch (item.kind) {
    case 'produce':
      return `produce:${item.cropId}`
    case 'product':
      return `product:${item.productId}`
    case 'material':
      return `material:${item.materialId}`
    case 'seed':
      return `seed:${item.cropId}`
    case 'good':
      return `good:${item.goodId}`
  }
}

/** Everything the farm can hold without running a single machine. */
function rawGoods(): Set<string> {
  const raw = new Set<string>()
  for (const crop of CROPS) {
    raw.add(`produce:${crop.id}`)
    raw.add(`seed:${crop.id}`)
  }
  for (const tree of TREES) {
    raw.add(`produce:${tree.id}`)
    raw.add(`seed:${tree.id}`)
  }
  for (const id of MATERIAL_IDS) raw.add(`material:${id}`)
  for (const product of PRODUCTS) {
    if (product.madeBy === null) raw.add(`product:${product.id}`)
  }
  raw.add('good:sprinkler')
  raw.add('good:fertilizer')
  return raw
}

/** Everything the farm can eventually hold, by running machines until nothing new appears. */
function obtainableGoods(): Set<string> {
  const held = rawGoods()
  let grew = true
  while (grew) {
    grew = false
    for (const recipe of allRecipes()) {
      const key = `product:${recipe.outputProductId}`
      if (held.has(key)) continue
      if (recipe.inputs.every((input) => held.has(inputKey(input.item)))) {
        held.add(key)
        grew = true
      }
    }
  }
  return held
}

function issueLines(issues: ReadonlyArray<{ code: string; subject: string; detail: string }>): string {
  return issues.map((i) => `${i.code}: ${i.subject} - ${i.detail}`).join('\n')
}

describe('the factory table', () => {
  it('carries all thirty factories the catalogue names', () => {
    expect(MACHINES.length).toBe(30)
    for (const kind of CATALOGUE) {
      expect(machineById(kind), `the catalogue requires a "${kind}"`).toBeDefined()
    }
  })

  it('gives every factory a unique kind, a name, a price and a queue', () => {
    const kinds = MACHINES.map((m) => m.kind)
    expect(new Set(kinds).size).toBe(kinds.length)
    for (const machine of MACHINES) {
      expect(machine.name.trim().length, machine.kind).toBeGreaterThan(0)
      expect(machine.cost, machine.kind).toBeGreaterThan(0)
      expect(machine.queueSize, machine.kind).toBeGreaterThan(0)
      expect(machine.level, machine.kind).toBeGreaterThanOrEqual(1)
    }
  })

  it('gives every factory at least three recipes', () => {
    for (const machine of MACHINES) {
      expect(machine.recipes.length, `${machine.kind} has ${machine.recipes.length} recipes`)
        .toBeGreaterThanOrEqual(3)
    }
  })

  it('gives every recipe a unique id, namespaced to its own machine', () => {
    const ids = allRecipes().map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const machine of MACHINES) {
      for (const recipe of machine.recipes) {
        expect(recipe.id.startsWith(`${machine.kind}.`), recipe.id).toBe(true)
        expect(machineForRecipe(recipe.id)?.kind).toBe(machine.kind)
        expect(recipeById(recipe.id)).toBe(recipe)
      }
    }
  })

  it('gives every recipe real inputs, real hours and a real output', () => {
    for (const recipe of allRecipes()) {
      expect(recipe.inputs.length, recipe.id).toBeGreaterThan(0)
      expect(recipe.hours, recipe.id).toBeGreaterThan(0)
      expect(recipe.outputCount, recipe.id).toBeGreaterThan(0)
      expect(productById(recipe.outputProductId), `${recipe.id} makes nothing real`).toBeDefined()
      for (const input of recipe.inputs) {
        expect(input.count, `${recipe.id} input`).toBeGreaterThan(0)
      }
    }
  })

  it('names every ingredient as something the game actually carries', () => {
    const known = rawGoods()
    for (const product of PRODUCTS) known.add(`product:${product.id}`)
    for (const recipe of allRecipes()) {
      for (const input of recipe.inputs) {
        expect(known, `${recipe.id} eats an unknown ${inputKey(input.item)}`).toContain(
          inputKey(input.item),
        )
      }
    }
  })

  it('gates every factory on the level the ladder publishes', () => {
    for (const machine of MACHINES) {
      expect(requiredLevel(`factory:${machine.kind}`), machine.kind).toBe(machine.level)
    }
  })

  it('never unlocks a recipe before the machine that runs it', () => {
    for (const machine of MACHINES) {
      for (const recipe of machine.recipes) {
        expect(recipe.level, recipe.id).toBeGreaterThanOrEqual(machine.level)
      }
    }
  })

  it('never unlocks a recipe before its own ingredients exist', () => {
    for (const recipe of allRecipes()) {
      for (const input of recipe.inputs) {
        if (input.item.kind !== 'product') continue
        const source = requireProduct(input.item.productId)
        expect(source.level, `${recipe.id} needs ${source.id}`).toBeLessThanOrEqual(recipe.level)
      }
    }
  })
})

describe('the product table', () => {
  it('reaches the hundred and twenty the catalogue demands', () => {
    expect(PRODUCTS.length).toBeGreaterThanOrEqual(120)
  })

  it('gives every product a unique id and a display name', () => {
    const ids = PRODUCTS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const product of PRODUCTS) {
      expect(product.name.trim().length, product.id).toBeGreaterThan(0)
    }
  })

  it('gives every product a distinct icon tint, so nothing shares a silhouette', () => {
    const tints = PRODUCTS.map((p) => p.art.tint)
    expect(new Set(tints).size).toBe(tints.length)
  })

  it('prices every product, with a season for each of the four', () => {
    for (const product of PRODUCTS) {
      expect(product.econ.base, product.id).toBeGreaterThan(0)
      expect(product.econ.elasticity, product.id).toBeGreaterThan(0)
      expect(product.econ.recovery, product.id).toBeGreaterThan(0)
      expect(product.econ.recovery, product.id).toBeLessThanOrEqual(1)
      for (const season of ['spring', 'summer', 'fall', 'winter'] as const) {
        const demand = product.econ.seasonal[season]
        expect(demand, `${product.id} in ${season}`).toBeGreaterThanOrEqual(0.8)
        expect(demand, `${product.id} in ${season}`).toBeLessThanOrEqual(1.3)
      }
    }
  })

  it('backs every manufactured product with a recipe that makes it', () => {
    for (const product of PRODUCTS) {
      if (product.madeBy === null) continue
      const recipes = recipesFor(product.id)
      expect(recipes.length, `nothing makes ${product.id}`).toBeGreaterThan(0)
      expect(productsByMachine(product.madeBy).map((p) => p.id)).toContain(product.id)
    }
  })

  it('indexes recipesUsing as the mirror of every recipe input', () => {
    for (const product of PRODUCTS) {
      for (const recipe of recipesUsing(product.id)) {
        const uses = recipe.inputs.some(
          (input) => input.item.kind === 'product' && input.item.productId === product.id,
        )
        expect(uses, `${recipe.id} is listed as using ${product.id}`).toBe(true)
      }
    }
  })

  it('lists nothing above the level asked of it', () => {
    for (const level of [8, 30, 60, 100]) {
      for (const product of productsForLevel(level)) {
        expect(product.level, product.id).toBeLessThanOrEqual(level)
      }
    }
  })
})

describe('reachability - a factory nothing feeds is a defect', () => {
  const obtainable = obtainableGoods()

  it('makes every product obtainable from raw goods alone', () => {
    const stranded = PRODUCTS.filter((p) => !obtainable.has(`product:${p.id}`)).map((p) => p.id)
    expect(stranded, `these can never be made: ${stranded.join(', ')}`).toEqual([])
  })

  it('leaves every factory with at least one recipe the player can actually run', () => {
    for (const machine of MACHINES) {
      const runnable = machine.recipes.filter((recipe) =>
        recipe.inputs.every((input) => obtainable.has(inputKey(input.item))),
      )
      expect(runnable.length, `nothing feeds the ${machine.kind}`).toBeGreaterThan(0)
    }
  })

  it('feeds every animal product into at least one chain', () => {
    for (const species of SPECIES) {
      for (const made of species.produces) {
        expect(
          recipesUsing(made.productId).length,
          `${made.productId} from the ${species.id} feeds nothing`,
        ).toBeGreaterThan(0)
      }
    }
  })

  it('makes every crop either an ingredient or a cash crop worth selling raw', () => {
    const eaten = new Set<string>()
    for (const recipe of allRecipes()) {
      for (const input of recipe.inputs) {
        if (input.item.kind === 'produce') eaten.add(input.item.cropId)
      }
    }
    const idle = CROPS.filter((crop) => !eaten.has(crop.id) && crop.basePrice < 60).map((c) => c.id)
    expect(idle, `these crops feed nothing and are not cash crops: ${idle.join(', ')}`).toEqual([])
  })
})

describe('validateEconomics', () => {
  const report = validateEconomics()

  it('passes with no errors at all', () => {
    expect(report.errors.length === 0 ? '' : issueLines(report.errors)).toBe('')
    expect(report.ok).toBe(true)
  })

  it('checked the whole catalogue, not a corner of it', () => {
    expect(report.checked.machines).toBe(30)
    expect(report.checked.products).toBeGreaterThanOrEqual(120)
    expect(report.checked.recipes).toBeGreaterThanOrEqual(90)
    expect(report.checked.chains).toBeGreaterThanOrEqual(REQUIRED_CHAINS.length)
  })

  it('clears the inputs of every single recipe by a real margin', () => {
    const thin: string[] = []
    for (const recipe of allRecipes()) {
      const cost = recipeInputCost(recipe)
      const value = recipeOutputValue(recipe)
      if (cost <= 0) continue
      if (value < cost * MIN_RECIPE_MARGIN) {
        thin.push(`${recipe.id}: ${value}g out of ${cost}g in (${(value / cost).toFixed(2)}x)`)
      }
    }
    expect(thin).toEqual([])
  })

  it('pays better than the ingredient a recipe is mostly made of, every time', () => {
    const weak: string[] = []
    for (const recipe of allRecipes()) {
      const main = dominantInput(recipe)
      if (main === null) continue
      const mainId =
        main.kind === 'product' ? main.productId : main.kind === 'produce' ? main.cropId : null
      const before = mainId === null ? 1 : chainYield(mainId)
      const after = chainYield(recipe.outputProductId)
      if (after <= before) {
        weak.push(`${recipe.id}: ${after.toFixed(2)}x against its input's ${before.toFixed(2)}x`)
      }
    }
    expect(weak).toEqual([])
  })

  it('makes every required chain pay more at every step than the step before', () => {
    for (const chain of REQUIRED_CHAINS) {
      const yields = chain.map((step) => chainYield(step))
      for (let i = 1; i < yields.length; i++) {
        expect(
          yields[i],
          `${chain.join(' > ')}: "${chain[i]}" returns ${yields[i].toFixed(2)}x, "${chain[i - 1]}" already returned ${yields[i - 1].toFixed(2)}x`,
        ).toBeGreaterThan(yields[i - 1])
      }
    }
  })

  it('pays a deep chain better per gold of raw input than a shallow one', () => {
    const shallow = chainYield('flour')
    const deep = chainYield('bread')
    const deepest = chainYield('sandwich')
    expect(chainYield('wheat')).toBe(1)
    expect(shallow).toBeGreaterThan(1)
    expect(deep).toBeGreaterThan(shallow)
    expect(deepest).toBeGreaterThan(deep)

    // ...and the same shape holds for the dairy line the catalogue names beside it.
    expect(chainYield('cream')).toBeGreaterThan(chainYield('milk'))
    expect(chainYield('butter')).toBeGreaterThan(chainYield('cream'))
    expect(chainYield('cake')).toBeGreaterThan(chainYield('butter'))
  })

  it('rises in depth as it rises in yield, chain by chain', () => {
    for (const chain of REQUIRED_CHAINS) {
      const depths = chain.map((step) => chainDepth(step))
      for (let i = 1; i < depths.length; i++) {
        expect(depths[i], `${chain.join(' > ')} at "${chain[i]}"`).toBeGreaterThan(depths[i - 1])
      }
    }
  })

  it('never lets a product cost more raw material than it sells for', () => {
    for (const product of PRODUCTS) {
      if (product.madeBy === null) continue
      expect(product.econ.base, `${product.id} sells under its own raw cost`).toBeGreaterThan(
        rawInputCost(product.id),
      )
    }
  })

  it('prices every ingredient a recipe eats, so no margin is measured against zero', () => {
    for (const recipe of allRecipes()) {
      for (const input of recipe.inputs) {
        expect(referenceValue(input.item), `${recipe.id} eats a free ${inputKey(input.item)}`)
          .toBeGreaterThan(0)
      }
    }
  })

  it('reports its warnings without failing on them', () => {
    for (const warning of report.warnings) {
      expect(warning.severity).toBe('warning')
    }
    expect(report.issues.length).toBe(report.errors.length + report.warnings.length)
  })
})

describe('level lookups', () => {
  it('offers no machine above the level asked of it', () => {
    for (const level of [6, 20, 50, 100]) {
      for (const machine of machinesForLevel(level)) {
        expect(machine.level, machine.kind).toBeLessThanOrEqual(level)
      }
    }
    expect(machinesForLevel(100).length).toBe(MACHINES.length)
  })

  it('offers no recipe above the level asked of it', () => {
    for (const machine of MACHINES) {
      const early: Recipe[] = recipesForLevel(machine.kind, machine.level)
      for (const recipe of early) expect(recipe.level).toBeLessThanOrEqual(machine.level)
      expect(recipesForLevel(machine.kind, 100).length).toBe(machine.recipes.length)
    }
  })

  it('gives every factory something to make within a few levels of buying it', () => {
    // A machine that sits idle for a whole band is a purchase the player regrets. Four of
    // the thirty open a level or three before their first recipe; none may run further.
    const idle: string[] = []
    for (const machine of MACHINES) {
      const first = Math.min(...machine.recipes.map((recipe) => recipe.level))
      if (first - machine.level > 3) {
        idle.push(`${machine.kind}: sold at ${machine.level}, first recipe at ${first}`)
      }
    }
    expect(idle).toEqual([])
    expect(recipesForLevel('mill', requireMachine('mill').level).length).toBeGreaterThan(0)
  })

  it('throws for a machine or a recipe nobody carries', () => {
    expect(() => requireMachine('flux-capacitor')).toThrow(/flux-capacitor/)
    expect(() => requireRecipe('mill.moonbeam')).toThrow(/mill.moonbeam/)
    expect(() => requireProduct('moonbeam')).toThrow(/moonbeam/)
  })
})
