/**
 * The thirty factories of Sprout Hollow and every recipe they run.
 *
 * Pure data. `hours` is in **in-game hours**, not real minutes — 24 hours is one
 * overnight, so a 72-hour keg job is three sleeps. Recipe ids are `<machine>.<product>`
 * and are stable: a saved `MachineJob` stores one.
 *
 * Every recipe input carries `quality: 'normal'`. That is a floor, not a demand: the
 * machine may consume any quality at or above it, and `docs/GAMEPLAY.md` §3 says the
 * output takes the quality of the best input, which is what makes a gold melon worth
 * pushing all the way down a chain.
 *
 * A machine's `kind` is deliberately the same string `unlocks.ts` publishes as
 * `factory:<kind>`, and every `level` here is the level that ladder gives it, so
 * `requiredLevel('factory:tea-house')` and `machineById('tea-house').level` can never
 * disagree. Recipe levels are the ladder's too where it names one, and otherwise are
 * lifted to whichever is later: the machine, or the last ingredient to become obtainable.
 * A recipe you can see but can never run is worse than one you cannot see.
 *
 * Prices for the outputs live in `products.ts`, which owns the economics and validates
 * that every one of these recipes clears the cost of what it eats.
 *
 * Contracts: docs/CATALOG.md §4, docs/GAMEPLAY.md §3, docs/PROGRESSION.md §1.
 */
import type { MachineDef, MachineKind, Recipe } from './farm-types'

export const MACHINES: readonly MachineDef[] = [
  {
    kind: 'feed-mill',
    name: 'FEED MILL',
    cost: 2000,
    materials: { wood: 20, stone: 8 },
    level: 6,
    queueSize: 4,
    recipes: [
      {
        id: 'feed-mill.animal-feed',
        inputs: [
          { item: { kind: 'produce', cropId: 'corn', quality: 'normal' }, count: 2 },
          { item: { kind: 'produce', cropId: 'wheat', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'animal-feed',
        outputCount: 2,
        hours: 4,
        level: 6,
      },
      {
        id: 'feed-mill.straw-bale',
        inputs: [
          { item: { kind: 'produce', cropId: 'wheat', quality: 'normal' }, count: 3 },
        ],
        outputProductId: 'straw-bale',
        outputCount: 2,
        hours: 3,
        level: 6,
      },
      {
        id: 'feed-mill.chicken-mash',
        inputs: [
          { item: { kind: 'produce', cropId: 'corn', quality: 'normal' }, count: 2 },
          { item: { kind: 'produce', cropId: 'soybean', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'chicken-mash',
        outputCount: 2,
        hours: 5,
        level: 22,
      },
      {
        id: 'feed-mill.fish-meal',
        inputs: [
          { item: { kind: 'product', productId: 'fish', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'fish-meal',
        outputCount: 2,
        hours: 6,
        level: 48,
      },
      {
        id: 'feed-mill.rich-feed',
        inputs: [
          { item: { kind: 'product', productId: 'animal-feed', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'molasses', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'rich-feed',
        outputCount: 2,
        hours: 8,
        level: 44,
      },
    ],
  },
  {
    kind: 'sawmill',
    name: 'SAWMILL',
    cost: 2500,
    materials: { wood: 30, stone: 12, saw: 1 },
    level: 20,
    queueSize: 3,
    recipes: [
      {
        id: 'sawmill.plank',
        inputs: [
          { item: { kind: 'material', materialId: 'wood' }, count: 3 },
        ],
        outputProductId: 'plank',
        outputCount: 2,
        hours: 4,
        level: 20,
      },
      {
        id: 'sawmill.shingle',
        inputs: [
          { item: { kind: 'material', materialId: 'wood' }, count: 2 },
        ],
        outputProductId: 'shingle',
        outputCount: 3,
        hours: 3,
        level: 20,
      },
      {
        id: 'sawmill.beam',
        inputs: [
          { item: { kind: 'material', materialId: 'wood' }, count: 4 },
          { item: { kind: 'material', materialId: 'stone' }, count: 1 },
        ],
        outputProductId: 'beam',
        outputCount: 1,
        hours: 8,
        level: 20,
      },
      {
        id: 'sawmill.charcoal',
        inputs: [
          { item: { kind: 'material', materialId: 'wood' }, count: 4 },
        ],
        outputProductId: 'charcoal',
        outputCount: 2,
        hours: 10,
        level: 20,
      },
    ],
  },
  {
    kind: 'mill',
    name: 'MILL',
    cost: 6000,
    materials: { wood: 40, stone: 25 },
    level: 12,
    queueSize: 4,
    recipes: [
      {
        id: 'mill.flour',
        inputs: [
          { item: { kind: 'produce', cropId: 'wheat', quality: 'normal' }, count: 3 },
        ],
        outputProductId: 'flour',
        outputCount: 2,
        hours: 4,
        level: 12,
      },
      {
        id: 'mill.cornmeal',
        inputs: [
          { item: { kind: 'produce', cropId: 'corn', quality: 'normal' }, count: 3 },
        ],
        outputProductId: 'cornmeal',
        outputCount: 2,
        hours: 4,
        level: 12,
      },
      {
        id: 'mill.rice-flour',
        inputs: [
          { item: { kind: 'produce', cropId: 'rice', quality: 'normal' }, count: 3 },
        ],
        outputProductId: 'rice-flour',
        outputCount: 2,
        hours: 5,
        level: 26,
      },
      {
        id: 'mill.malt',
        inputs: [
          { item: { kind: 'produce', cropId: 'barley', quality: 'normal' }, count: 3 },
        ],
        outputProductId: 'malt',
        outputCount: 2,
        hours: 6,
        level: 26,
      },
    ],
  },
  {
    kind: 'dairy',
    name: 'DAIRY',
    cost: 4000,
    materials: { wood: 30, stone: 15, nail: 8 },
    level: 15,
    queueSize: 4,
    recipes: [
      {
        id: 'dairy.cream',
        inputs: [
          { item: { kind: 'product', productId: 'milk', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'cream',
        outputCount: 1,
        hours: 3,
        level: 15,
      },
      {
        id: 'dairy.yoghurt',
        inputs: [
          { item: { kind: 'product', productId: 'milk', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'yoghurt',
        outputCount: 2,
        hours: 5,
        level: 17,
      },
      {
        id: 'dairy.cheese',
        inputs: [
          { item: { kind: 'product', productId: 'cream', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'milk', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'cheese',
        outputCount: 1,
        hours: 8,
        level: 41,
      },
      {
        id: 'dairy.butter',
        inputs: [
          { item: { kind: 'product', productId: 'cream', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'butter',
        outputCount: 1,
        hours: 6,
        level: 21,
      },
      {
        id: 'dairy.goat-cheese',
        inputs: [
          { item: { kind: 'product', productId: 'goat-milk', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'goat-cheese',
        outputCount: 1,
        hours: 10,
        level: 40,
      },
      {
        id: 'dairy.condensed-milk',
        inputs: [
          { item: { kind: 'product', productId: 'milk', quality: 'normal' }, count: 3 },
          { item: { kind: 'product', productId: 'sugar', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'condensed-milk',
        outputCount: 2,
        hours: 9,
        level: 44,
      },
      {
        id: 'dairy.aged-cheese',
        inputs: [
          { item: { kind: 'product', productId: 'cheese', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'aged-cheese',
        outputCount: 1,
        hours: 48,
        level: 85,
      },
    ],
  },
  {
    kind: 'bakery',
    name: 'BAKERY',
    cost: 5000,
    materials: { stone: 40, wood: 25, nail: 10 },
    level: 22,
    queueSize: 4,
    recipes: [
      {
        id: 'bakery.bread',
        inputs: [
          { item: { kind: 'product', productId: 'flour', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'egg', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'bread',
        outputCount: 1,
        hours: 6,
        level: 22,
      },
      {
        id: 'bakery.cookies',
        inputs: [
          { item: { kind: 'product', productId: 'flour', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'butter', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'sugar', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'cookies',
        outputCount: 3,
        hours: 5,
        level: 34,
      },
      {
        id: 'bakery.donut',
        inputs: [
          { item: { kind: 'product', productId: 'flour', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'sugar', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'cooking-oil', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'donut',
        outputCount: 2,
        hours: 7,
        level: 44,
      },
      {
        id: 'bakery.banana-bread',
        inputs: [
          { item: { kind: 'product', productId: 'flour', quality: 'normal' }, count: 1 },
          { item: { kind: 'produce', cropId: 'banana', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'butter', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'banana-bread',
        outputCount: 2,
        hours: 9,
        level: 54,
      },
      {
        id: 'bakery.croissant',
        inputs: [
          { item: { kind: 'product', productId: 'flour', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'butter', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'croissant',
        outputCount: 3,
        hours: 9,
        level: 40,
      },
      {
        id: 'bakery.cake',
        inputs: [
          { item: { kind: 'product', productId: 'flour', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'butter', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'sugar', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'egg', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'cake',
        outputCount: 1,
        hours: 12,
        level: 81,
      },
      {
        id: 'bakery.pizza',
        inputs: [
          { item: { kind: 'product', productId: 'flour', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'cheese', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'pasta-sauce', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'pizza',
        outputCount: 2,
        hours: 10,
        level: 56,
      },
      {
        id: 'bakery.sandwich',
        inputs: [
          { item: { kind: 'product', productId: 'bread', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'cheese', quality: 'normal' }, count: 1 },
          { item: { kind: 'produce', cropId: 'lettuce', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'sandwich',
        outputCount: 2,
        hours: 4,
        level: 64,
      },
      {
        id: 'bakery.gourmet-pizza',
        inputs: [
          { item: { kind: 'product', productId: 'pizza', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'truffle', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'goat-cheese', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'gourmet-pizza',
        outputCount: 1,
        hours: 14,
        level: 87,
      },
    ],
  },
  {
    kind: 'pie-oven',
    name: 'PIE OVEN',
    cost: 5500,
    materials: { stone: 45, wood: 20, nail: 12 },
    level: 47,
    queueSize: 3,
    recipes: [
      {
        id: 'pie-oven.apple-pie',
        inputs: [
          { item: { kind: 'product', productId: 'flour', quality: 'normal' }, count: 2 },
          { item: { kind: 'produce', cropId: 'apple', quality: 'normal' }, count: 3 },
        ],
        outputProductId: 'apple-pie',
        outputCount: 2,
        hours: 12,
        level: 47,
      },
      {
        id: 'pie-oven.pumpkin-pie',
        inputs: [
          { item: { kind: 'product', productId: 'flour', quality: 'normal' }, count: 2 },
          { item: { kind: 'produce', cropId: 'pumpkin', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'cream', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'pumpkin-pie',
        outputCount: 2,
        hours: 14,
        level: 47,
      },
      {
        id: 'pie-oven.berry-pie',
        inputs: [
          { item: { kind: 'product', productId: 'flour', quality: 'normal' }, count: 2 },
          { item: { kind: 'produce', cropId: 'blackberry', quality: 'normal' }, count: 4 },
        ],
        outputProductId: 'berry-pie',
        outputCount: 2,
        hours: 12,
        level: 47,
      },
      {
        id: 'pie-oven.quiche',
        inputs: [
          { item: { kind: 'product', productId: 'flour', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'egg', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'cheese', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'quiche',
        outputCount: 2,
        hours: 10,
        level: 47,
      },
      {
        id: 'pie-oven.custard-tart',
        inputs: [
          { item: { kind: 'product', productId: 'flour', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'duck-egg', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'cream', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'custard-tart',
        outputCount: 2,
        hours: 11,
        level: 47,
      },
      {
        id: 'pie-oven.cherry-tart',
        inputs: [
          { item: { kind: 'product', productId: 'flour', quality: 'normal' }, count: 1 },
          { item: { kind: 'produce', cropId: 'cherry', quality: 'normal' }, count: 3 },
          { item: { kind: 'product', productId: 'butter', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'cherry-tart',
        outputCount: 2,
        hours: 11,
        level: 47,
      },
      {
        id: 'pie-oven.meat-pie',
        inputs: [
          { item: { kind: 'product', productId: 'flour', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'bacon', quality: 'normal' }, count: 2 },
          { item: { kind: 'produce', cropId: 'onion', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'meat-pie',
        outputCount: 2,
        hours: 14,
        level: 78,
      },
    ],
  },
  {
    kind: 'sugar-mill',
    name: 'SUGAR MILL',
    cost: 5500,
    materials: { wood: 35, stone: 30, bolt: 6 },
    level: 27,
    queueSize: 4,
    recipes: [
      {
        id: 'sugar-mill.syrup',
        inputs: [
          { item: { kind: 'produce', cropId: 'sugarcane', quality: 'normal' }, count: 3 },
        ],
        outputProductId: 'syrup',
        outputCount: 2,
        hours: 6,
        level: 30,
      },
      {
        id: 'sugar-mill.sugar',
        inputs: [
          { item: { kind: 'product', productId: 'syrup', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'sugar',
        outputCount: 1,
        hours: 8,
        level: 32,
      },
      {
        id: 'sugar-mill.molasses',
        inputs: [
          { item: { kind: 'product', productId: 'syrup', quality: 'normal' }, count: 3 },
        ],
        outputProductId: 'molasses',
        outputCount: 2,
        hours: 10,
        level: 30,
      },
      {
        id: 'sugar-mill.brown-sugar',
        inputs: [
          { item: { kind: 'product', productId: 'sugar', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'molasses', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'brown-sugar',
        outputCount: 2,
        hours: 6,
        level: 44,
      },
    ],
  },
  {
    kind: 'jam-maker',
    name: 'JAM MAKER',
    cost: 3000,
    materials: { wood: 18, stone: 10, fibre: 12 },
    level: 24,
    queueSize: 3,
    recipes: [
      {
        id: 'jam-maker.strawberry-jam',
        inputs: [
          { item: { kind: 'produce', cropId: 'strawberry', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'strawberry-jam',
        outputCount: 1,
        hours: 16,
        level: 26,
      },
      {
        id: 'jam-maker.blackberry-jam',
        inputs: [
          { item: { kind: 'produce', cropId: 'blackberry', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'blackberry-jam',
        outputCount: 1,
        hours: 16,
        level: 26,
      },
      {
        id: 'jam-maker.raspberry-jam',
        inputs: [
          { item: { kind: 'produce', cropId: 'raspberry', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'raspberry-jam',
        outputCount: 1,
        hours: 16,
        level: 27,
      },
      {
        id: 'jam-maker.grape-jelly',
        inputs: [
          { item: { kind: 'produce', cropId: 'grape', quality: 'normal' }, count: 3 },
        ],
        outputProductId: 'grape-jelly',
        outputCount: 1,
        hours: 16,
        level: 28,
      },
      {
        id: 'jam-maker.peach-jam',
        inputs: [
          { item: { kind: 'produce', cropId: 'peach', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'peach-jam',
        outputCount: 1,
        hours: 16,
        level: 30,
      },
      {
        id: 'jam-maker.plum-jam',
        inputs: [
          { item: { kind: 'produce', cropId: 'plum', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'plum-jam',
        outputCount: 1,
        hours: 16,
        level: 31,
      },
      {
        id: 'jam-maker.mango-jam',
        inputs: [
          { item: { kind: 'produce', cropId: 'mango', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'mango-jam',
        outputCount: 1,
        hours: 18,
        level: 48,
      },
      {
        id: 'jam-maker.orange-marmalade',
        inputs: [
          { item: { kind: 'produce', cropId: 'orange', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'sugar', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'orange-marmalade',
        outputCount: 1,
        hours: 18,
        level: 38,
      },
    ],
  },
  {
    kind: 'juice-press',
    name: 'JUICE PRESS',
    cost: 4500,
    materials: { wood: 25, stone: 12, bolt: 8, screw: 6 },
    level: 35,
    queueSize: 4,
    recipes: [
      {
        id: 'juice-press.carrot-juice',
        inputs: [
          { item: { kind: 'produce', cropId: 'carrot', quality: 'normal' }, count: 4 },
        ],
        outputProductId: 'carrot-juice',
        outputCount: 2,
        hours: 8,
        level: 35,
      },
      {
        id: 'juice-press.apple-juice',
        inputs: [
          { item: { kind: 'produce', cropId: 'apple', quality: 'normal' }, count: 3 },
        ],
        outputProductId: 'apple-juice',
        outputCount: 2,
        hours: 10,
        level: 35,
      },
      {
        id: 'juice-press.orange-juice',
        inputs: [
          { item: { kind: 'produce', cropId: 'orange', quality: 'normal' }, count: 3 },
        ],
        outputProductId: 'orange-juice',
        outputCount: 2,
        hours: 10,
        level: 35,
      },
      {
        id: 'juice-press.grape-juice',
        inputs: [
          { item: { kind: 'produce', cropId: 'grape', quality: 'normal' }, count: 3 },
        ],
        outputProductId: 'grape-juice',
        outputCount: 2,
        hours: 10,
        level: 35,
      },
      {
        id: 'juice-press.lemonade',
        inputs: [
          { item: { kind: 'produce', cropId: 'lemon', quality: 'normal' }, count: 3 },
          { item: { kind: 'product', productId: 'syrup', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'lemonade',
        outputCount: 2,
        hours: 9,
        level: 40,
      },
      {
        id: 'juice-press.berry-smoothie',
        inputs: [
          { item: { kind: 'produce', cropId: 'raspberry', quality: 'normal' }, count: 3 },
          { item: { kind: 'product', productId: 'yoghurt', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'berry-smoothie',
        outputCount: 2,
        hours: 12,
        level: 44,
      },
      {
        id: 'juice-press.melon-smoothie',
        inputs: [
          { item: { kind: 'produce', cropId: 'melon', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'milk', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'melon-smoothie',
        outputCount: 2,
        hours: 12,
        level: 46,
      },
    ],
  },
  {
    kind: 'oil-press',
    name: 'OIL PRESS',
    cost: 4800,
    materials: { wood: 28, stone: 18, bolt: 10 },
    level: 43,
    queueSize: 3,
    recipes: [
      {
        id: 'oil-press.olive-oil',
        inputs: [
          { item: { kind: 'produce', cropId: 'olive', quality: 'normal' }, count: 3 },
        ],
        outputProductId: 'olive-oil',
        outputCount: 1,
        hours: 12,
        level: 43,
      },
      {
        id: 'oil-press.cooking-oil',
        inputs: [
          { item: { kind: 'produce', cropId: 'soybean', quality: 'normal' }, count: 4 },
        ],
        outputProductId: 'cooking-oil',
        outputCount: 2,
        hours: 10,
        level: 44,
      },
      {
        id: 'oil-press.coconut-oil',
        inputs: [
          { item: { kind: 'produce', cropId: 'coconut', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'coconut-oil',
        outputCount: 1,
        hours: 12,
        level: 48,
      },
      {
        id: 'oil-press.cocoa-butter',
        inputs: [
          { item: { kind: 'produce', cropId: 'cacao', quality: 'normal' }, count: 3 },
        ],
        outputProductId: 'cocoa-butter',
        outputCount: 2,
        hours: 14,
        level: 60,
      },
      {
        id: 'oil-press.truffle-oil',
        inputs: [
          { item: { kind: 'product', productId: 'truffle', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'cooking-oil', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'truffle-oil',
        outputCount: 2,
        hours: 12,
        level: 78,
      },
    ],
  },
  {
    kind: 'loom',
    name: 'LOOM',
    cost: 4000,
    materials: { wood: 35, fibre: 30, plank: 6 },
    level: 31,
    queueSize: 3,
    recipes: [
      {
        id: 'loom.cloth',
        inputs: [
          { item: { kind: 'product', productId: 'wool', quality: 'normal' }, count: 3 },
        ],
        outputProductId: 'cloth',
        outputCount: 2,
        hours: 8,
        level: 38,
      },
      {
        id: 'loom.cotton-cloth',
        inputs: [
          { item: { kind: 'produce', cropId: 'cotton', quality: 'normal' }, count: 4 },
        ],
        outputProductId: 'cotton-cloth',
        outputCount: 2,
        hours: 8,
        level: 31,
      },
      {
        id: 'loom.fabric',
        inputs: [
          { item: { kind: 'product', productId: 'cloth', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'indigo-dye', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'fabric',
        outputCount: 2,
        hours: 12,
        level: 84,
      },
      {
        id: 'loom.angora-yarn',
        inputs: [
          { item: { kind: 'product', productId: 'angora-wool', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'angora-yarn',
        outputCount: 2,
        hours: 10,
        level: 74,
      },
      {
        id: 'loom.lace',
        inputs: [
          { item: { kind: 'product', productId: 'cotton-cloth', quality: 'normal' }, count: 2 },
          { item: { kind: 'material', materialId: 'fibre' }, count: 2 },
        ],
        outputProductId: 'lace',
        outputCount: 1,
        hours: 14,
        level: 58,
      },
      {
        id: 'loom.rug',
        inputs: [
          { item: { kind: 'product', productId: 'cloth', quality: 'normal' }, count: 3 },
          { item: { kind: 'product', productId: 'red-dye', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'rug',
        outputCount: 1,
        hours: 20,
        level: 62,
      },
    ],
  },
  {
    kind: 'sewing-machine',
    name: 'SEWING BENCH',
    cost: 6500,
    materials: { plank: 10, bolt: 12, screw: 12, fibre: 20 },
    level: 40,
    queueSize: 3,
    recipes: [
      {
        id: 'sewing-machine.clothing',
        inputs: [
          { item: { kind: 'product', productId: 'cloth', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'clothing',
        outputCount: 1,
        hours: 14,
        level: 40,
      },
      {
        id: 'sewing-machine.hat',
        inputs: [
          { item: { kind: 'product', productId: 'cloth', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'feather', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'hat',
        outputCount: 1,
        hours: 8,
        level: 40,
      },
      {
        id: 'sewing-machine.sun-hat',
        inputs: [
          { item: { kind: 'product', productId: 'cotton-cloth', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'yellow-dye', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'sun-hat',
        outputCount: 1,
        hours: 8,
        level: 45,
      },
      {
        id: 'sewing-machine.bag',
        inputs: [
          { item: { kind: 'product', productId: 'cotton-cloth', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'fabric', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'bag',
        outputCount: 1,
        hours: 12,
        level: 84,
      },
      {
        id: 'sewing-machine.scarf',
        inputs: [
          { item: { kind: 'product', productId: 'angora-yarn', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'scarf',
        outputCount: 1,
        hours: 12,
        level: 74,
      },
      {
        id: 'sewing-machine.dress',
        inputs: [
          { item: { kind: 'product', productId: 'fabric', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'lace', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'dress',
        outputCount: 1,
        hours: 18,
        level: 84,
      },
      {
        id: 'sewing-machine.robe',
        inputs: [
          { item: { kind: 'product', productId: 'fabric', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'purple-dye', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'robe',
        outputCount: 1,
        hours: 18,
        level: 84,
      },
      {
        id: 'sewing-machine.quilt',
        inputs: [
          { item: { kind: 'product', productId: 'fabric', quality: 'normal' }, count: 3 },
          { item: { kind: 'product', productId: 'down', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'quilt',
        outputCount: 1,
        hours: 24,
        level: 84,
      },
      {
        id: 'sewing-machine.silk-gown',
        inputs: [
          { item: { kind: 'product', productId: 'dress', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'lace', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'purple-dye', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'silk-gown',
        outputCount: 1,
        hours: 30,
        level: 96,
      },
    ],
  },
  {
    kind: 'dye-vat',
    name: 'DYE VAT',
    cost: 3500,
    materials: { stone: 25, wood: 15, fibre: 10 },
    level: 45,
    queueSize: 4,
    recipes: [
      {
        id: 'dye-vat.indigo-dye',
        inputs: [
          { item: { kind: 'produce', cropId: 'indigo', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'indigo-dye',
        outputCount: 2,
        hours: 8,
        level: 46,
      },
      {
        id: 'dye-vat.red-dye',
        inputs: [
          { item: { kind: 'produce', cropId: 'beet', quality: 'normal' }, count: 3 },
        ],
        outputProductId: 'red-dye',
        outputCount: 2,
        hours: 8,
        level: 45,
      },
      {
        id: 'dye-vat.yellow-dye',
        inputs: [
          { item: { kind: 'produce', cropId: 'onion', quality: 'normal' }, count: 4 },
        ],
        outputProductId: 'yellow-dye',
        outputCount: 2,
        hours: 8,
        level: 45,
      },
      {
        id: 'dye-vat.pink-dye',
        inputs: [
          { item: { kind: 'produce', cropId: 'tulip', quality: 'normal' }, count: 3 },
        ],
        outputProductId: 'pink-dye',
        outputCount: 2,
        hours: 8,
        level: 45,
      },
      {
        id: 'dye-vat.purple-dye',
        inputs: [
          { item: { kind: 'product', productId: 'indigo-dye', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'red-dye', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'purple-dye',
        outputCount: 2,
        hours: 6,
        level: 48,
      },
      {
        id: 'dye-vat.ink',
        inputs: [
          { item: { kind: 'product', productId: 'indigo-dye', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'charcoal', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'ink',
        outputCount: 1,
        hours: 10,
        level: 52,
      },
    ],
  },
  {
    kind: 'honey-extractor',
    name: 'HONEY HOUSE',
    cost: 3800,
    materials: { plank: 8, bolt: 8, fibre: 10 },
    level: 30,
    queueSize: 4,
    recipes: [
      {
        id: 'honey-extractor.honey',
        inputs: [
          { item: { kind: 'product', productId: 'honeycomb', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'honey',
        outputCount: 2,
        hours: 6,
        level: 30,
      },
      {
        id: 'honey-extractor.beeswax',
        inputs: [
          { item: { kind: 'product', productId: 'honeycomb', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'beeswax',
        outputCount: 1,
        hours: 6,
        level: 30,
      },
      {
        id: 'honey-extractor.royal-jelly',
        inputs: [
          { item: { kind: 'product', productId: 'honeycomb', quality: 'normal' }, count: 4 },
        ],
        outputProductId: 'royal-jelly',
        outputCount: 1,
        hours: 20,
        level: 60,
      },
      {
        id: 'honey-extractor.honey-butter',
        inputs: [
          { item: { kind: 'product', productId: 'honey', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'butter', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'honey-butter',
        outputCount: 2,
        hours: 6,
        level: 62,
      },
    ],
  },
  {
    kind: 'popcorn-pot',
    name: 'POPCORN POT',
    cost: 2800,
    materials: { stone: 22, wood: 14, nail: 6 },
    level: 61,
    queueSize: 4,
    recipes: [
      {
        id: 'popcorn-pot.popcorn',
        inputs: [
          { item: { kind: 'produce', cropId: 'corn', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'popcorn',
        outputCount: 3,
        hours: 3,
        level: 61,
      },
      {
        id: 'popcorn-pot.kettle-corn',
        inputs: [
          { item: { kind: 'produce', cropId: 'corn', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'sugar', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'kettle-corn',
        outputCount: 3,
        hours: 5,
        level: 62,
      },
      {
        id: 'popcorn-pot.cheese-popcorn',
        inputs: [
          { item: { kind: 'product', productId: 'popcorn', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'cheese', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'cheese-popcorn',
        outputCount: 2,
        hours: 5,
        level: 61,
      },
      {
        id: 'popcorn-pot.caramel-corn',
        inputs: [
          { item: { kind: 'product', productId: 'popcorn', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'caramel', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'caramel-corn',
        outputCount: 2,
        hours: 6,
        level: 72,
      },
    ],
  },
  {
    kind: 'bbq-grill',
    name: 'BBQ GRILL',
    cost: 7000,
    materials: { stone: 50, plank: 8, nail: 14 },
    level: 58,
    queueSize: 3,
    recipes: [
      {
        id: 'bbq-grill.grilled-corn',
        inputs: [
          { item: { kind: 'produce', cropId: 'corn', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'butter', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'grilled-corn',
        outputCount: 2,
        hours: 6,
        level: 58,
      },
      {
        id: 'bbq-grill.roasted-squash',
        inputs: [
          { item: { kind: 'produce', cropId: 'squash', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'cooking-oil', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'roasted-squash',
        outputCount: 2,
        hours: 8,
        level: 58,
      },
      {
        id: 'bbq-grill.grilled-fish',
        inputs: [
          { item: { kind: 'product', productId: 'fish', quality: 'normal' }, count: 2 },
          { item: { kind: 'produce', cropId: 'lemon', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'grilled-fish',
        outputCount: 2,
        hours: 8,
        level: 58,
      },
      {
        id: 'bbq-grill.bacon-and-eggs',
        inputs: [
          { item: { kind: 'product', productId: 'bacon', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'egg', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'bacon-and-eggs',
        outputCount: 2,
        hours: 8,
        level: 78,
      },
      {
        id: 'bbq-grill.skewer',
        inputs: [
          { item: { kind: 'product', productId: 'bacon', quality: 'normal' }, count: 1 },
          { item: { kind: 'produce', cropId: 'pepper', quality: 'normal' }, count: 1 },
          { item: { kind: 'produce', cropId: 'onion', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'skewer',
        outputCount: 2,
        hours: 14,
        level: 78,
      },
      {
        id: 'bbq-grill.roast',
        inputs: [
          { item: { kind: 'product', productId: 'bacon', quality: 'normal' }, count: 2 },
          { item: { kind: 'produce', cropId: 'potato', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'roast',
        outputCount: 1,
        hours: 16,
        level: 78,
      },
      {
        id: 'bbq-grill.farm-breakfast',
        inputs: [
          { item: { kind: 'product', productId: 'bacon', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'turkey-egg', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'bread', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'farm-breakfast',
        outputCount: 1,
        hours: 10,
        level: 78,
      },
      {
        id: 'bbq-grill.burger',
        inputs: [
          { item: { kind: 'product', productId: 'bread', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'bacon', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'cheese', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'burger',
        outputCount: 1,
        hours: 10,
        level: 78,
      },
      {
        id: 'bbq-grill.royal-banquet',
        inputs: [
          { item: { kind: 'product', productId: 'roast', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'lasagne', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'festival-platter', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'royal-banquet',
        outputCount: 1,
        hours: 24,
        level: 98,
      },
    ],
  },
  {
    kind: 'soup-kitchen',
    name: 'SOUP KITCHEN',
    cost: 5000,
    materials: { stone: 35, wood: 30, nail: 10 },
    level: 50,
    queueSize: 4,
    recipes: [
      {
        id: 'soup-kitchen.vegetable-stew',
        inputs: [
          { item: { kind: 'produce', cropId: 'carrot', quality: 'normal' }, count: 1 },
          { item: { kind: 'produce', cropId: 'parsnip', quality: 'normal' }, count: 1 },
          { item: { kind: 'produce', cropId: 'potato', quality: 'normal' }, count: 1 },
          { item: { kind: 'produce', cropId: 'onion', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'vegetable-stew',
        outputCount: 2,
        hours: 10,
        level: 51,
      },
      {
        id: 'soup-kitchen.pea-soup',
        inputs: [
          { item: { kind: 'produce', cropId: 'peas', quality: 'normal' }, count: 3 },
          { item: { kind: 'produce', cropId: 'onion', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'pea-soup',
        outputCount: 2,
        hours: 10,
        level: 50,
      },
      {
        id: 'soup-kitchen.tomato-soup',
        inputs: [
          { item: { kind: 'produce', cropId: 'tomato', quality: 'normal' }, count: 3 },
          { item: { kind: 'product', productId: 'cream', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'tomato-soup',
        outputCount: 2,
        hours: 10,
        level: 50,
      },
      {
        id: 'soup-kitchen.pumpkin-soup',
        inputs: [
          { item: { kind: 'produce', cropId: 'pumpkin', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'cream', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'pumpkin-soup',
        outputCount: 2,
        hours: 10,
        level: 51,
      },
      {
        id: 'soup-kitchen.mushroom-soup',
        inputs: [
          { item: { kind: 'produce', cropId: 'frostcap', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'cream', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'mushroom-soup',
        outputCount: 2,
        hours: 10,
        level: 52,
      },
      {
        id: 'soup-kitchen.egg-drop-soup',
        inputs: [
          { item: { kind: 'product', productId: 'turkey-egg', quality: 'normal' }, count: 2 },
          { item: { kind: 'produce', cropId: 'spinach', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'egg-drop-soup',
        outputCount: 2,
        hours: 8,
        level: 54,
      },
      {
        id: 'soup-kitchen.chowder',
        inputs: [
          { item: { kind: 'product', productId: 'fish', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'milk', quality: 'normal' }, count: 1 },
          { item: { kind: 'produce', cropId: 'potato', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'chowder',
        outputCount: 2,
        hours: 12,
        level: 56,
      },
      {
        id: 'soup-kitchen.fish-stew',
        inputs: [
          { item: { kind: 'product', productId: 'fish', quality: 'normal' }, count: 2 },
          { item: { kind: 'produce', cropId: 'potato', quality: 'normal' }, count: 1 },
          { item: { kind: 'produce', cropId: 'onion', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'fish-stew',
        outputCount: 2,
        hours: 14,
        level: 58,
      },
      {
        id: 'soup-kitchen.bacon-stew',
        inputs: [
          { item: { kind: 'product', productId: 'bacon', quality: 'normal' }, count: 2 },
          { item: { kind: 'produce', cropId: 'potato', quality: 'normal' }, count: 2 },
          { item: { kind: 'produce', cropId: 'carrot', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'bacon-stew',
        outputCount: 2,
        hours: 18,
        level: 78,
      },
      {
        id: 'soup-kitchen.harvest-feast',
        inputs: [
          { item: { kind: 'product', productId: 'roast', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'vegetable-stew', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'bread', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'harvest-feast',
        outputCount: 1,
        hours: 20,
        level: 94,
      },
    ],
  },
  {
    kind: 'salad-bar',
    name: 'SALAD BAR',
    cost: 3200,
    materials: { plank: 8, wood: 20, nail: 8 },
    level: 52,
    queueSize: 4,
    recipes: [
      {
        id: 'salad-bar.garden-salad',
        inputs: [
          { item: { kind: 'produce', cropId: 'lettuce', quality: 'normal' }, count: 2 },
          { item: { kind: 'produce', cropId: 'tomato', quality: 'normal' }, count: 1 },
          { item: { kind: 'produce', cropId: 'cucumber', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'garden-salad',
        outputCount: 2,
        hours: 4,
        level: 53,
      },
      {
        id: 'salad-bar.coleslaw',
        inputs: [
          { item: { kind: 'produce', cropId: 'cabbage', quality: 'normal' }, count: 1 },
          { item: { kind: 'produce', cropId: 'carrot', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'yoghurt', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'coleslaw',
        outputCount: 2,
        hours: 6,
        level: 52,
      },
      {
        id: 'salad-bar.fruit-salad',
        inputs: [
          { item: { kind: 'produce', cropId: 'apple', quality: 'normal' }, count: 1 },
          { item: { kind: 'produce', cropId: 'banana', quality: 'normal' }, count: 1 },
          { item: { kind: 'produce', cropId: 'orange', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'fruit-salad',
        outputCount: 2,
        hours: 5,
        level: 54,
      },
      {
        id: 'salad-bar.winter-salad',
        inputs: [
          { item: { kind: 'produce', cropId: 'snowcabbage', quality: 'normal' }, count: 1 },
          { item: { kind: 'produce', cropId: 'winterroot', quality: 'normal' }, count: 1 },
          { item: { kind: 'produce', cropId: 'apple', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'winter-salad',
        outputCount: 2,
        hours: 6,
        level: 55,
      },
      {
        id: 'salad-bar.potato-salad',
        inputs: [
          { item: { kind: 'produce', cropId: 'potato', quality: 'normal' }, count: 3 },
          { item: { kind: 'product', productId: 'egg', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'yoghurt', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'potato-salad',
        outputCount: 2,
        hours: 7,
        level: 56,
      },
      {
        id: 'salad-bar.caesar-salad',
        inputs: [
          { item: { kind: 'produce', cropId: 'lettuce', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'cheese', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'bread', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'caesar-salad',
        outputCount: 2,
        hours: 8,
        level: 60,
      },
      {
        id: 'salad-bar.greek-salad',
        inputs: [
          { item: { kind: 'produce', cropId: 'cucumber', quality: 'normal' }, count: 1 },
          { item: { kind: 'produce', cropId: 'tomato', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'cheese', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'olive-oil', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'greek-salad',
        outputCount: 2,
        hours: 8,
        level: 62,
      },
      {
        id: 'salad-bar.festival-platter',
        inputs: [
          { item: { kind: 'product', productId: 'aged-cheese', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'cured-olive', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'sandwich', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'festival-platter',
        outputCount: 1,
        hours: 12,
        level: 95,
      },
    ],
  },
  {
    kind: 'sauce-maker',
    name: 'SAUCE MAKER',
    cost: 4200,
    materials: { stone: 28, wood: 22, fibre: 8 },
    level: 54,
    queueSize: 4,
    recipes: [
      {
        id: 'sauce-maker.pasta-sauce',
        inputs: [
          { item: { kind: 'produce', cropId: 'tomato', quality: 'normal' }, count: 4 },
          { item: { kind: 'produce', cropId: 'garlic', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'pasta-sauce',
        outputCount: 2,
        hours: 10,
        level: 54,
      },
      {
        id: 'sauce-maker.salsa',
        inputs: [
          { item: { kind: 'produce', cropId: 'tomato', quality: 'normal' }, count: 3 },
          { item: { kind: 'produce', cropId: 'chilli', quality: 'normal' }, count: 1 },
          { item: { kind: 'produce', cropId: 'onion', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'salsa',
        outputCount: 2,
        hours: 10,
        level: 54,
      },
      {
        id: 'sauce-maker.ketchup',
        inputs: [
          { item: { kind: 'produce', cropId: 'tomato', quality: 'normal' }, count: 5 },
          { item: { kind: 'product', productId: 'sugar', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'ketchup',
        outputCount: 2,
        hours: 12,
        level: 59,
      },
      {
        id: 'sauce-maker.chilli-oil',
        inputs: [
          { item: { kind: 'produce', cropId: 'chilli', quality: 'normal' }, count: 3 },
          { item: { kind: 'product', productId: 'cooking-oil', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'chilli-oil',
        outputCount: 2,
        hours: 10,
        level: 58,
      },
      {
        id: 'sauce-maker.hot-sauce',
        inputs: [
          { item: { kind: 'produce', cropId: 'chilli', quality: 'normal' }, count: 4 },
          { item: { kind: 'produce', cropId: 'garlic', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'hot-sauce',
        outputCount: 1,
        hours: 14,
        level: 60,
      },
      {
        id: 'sauce-maker.pesto',
        inputs: [
          { item: { kind: 'produce', cropId: 'spinach', quality: 'normal' }, count: 3 },
          { item: { kind: 'product', productId: 'olive-oil', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'cheese', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'pesto',
        outputCount: 2,
        hours: 12,
        level: 64,
      },
    ],
  },
  {
    kind: 'pasta-maker',
    name: 'PASTA MAKER',
    cost: 4600,
    materials: { plank: 8, bolt: 10, screw: 10 },
    level: 56,
    queueSize: 4,
    recipes: [
      {
        id: 'pasta-maker.pasta',
        inputs: [
          { item: { kind: 'product', productId: 'flour', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'egg', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'pasta',
        outputCount: 3,
        hours: 8,
        level: 57,
      },
      {
        id: 'pasta-maker.noodles',
        inputs: [
          { item: { kind: 'product', productId: 'rice-flour', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'noodles',
        outputCount: 3,
        hours: 8,
        level: 56,
      },
      {
        id: 'pasta-maker.egg-noodle',
        inputs: [
          { item: { kind: 'product', productId: 'flour', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'goose-egg', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'egg-noodle',
        outputCount: 3,
        hours: 8,
        level: 72,
      },
      {
        id: 'pasta-maker.mac-and-cheese',
        inputs: [
          { item: { kind: 'product', productId: 'pasta', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'cheese', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'butter', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'mac-and-cheese',
        outputCount: 2,
        hours: 10,
        level: 64,
      },
      {
        id: 'pasta-maker.ravioli',
        inputs: [
          { item: { kind: 'product', productId: 'pasta', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'cheese', quality: 'normal' }, count: 1 },
          { item: { kind: 'produce', cropId: 'spinach', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'ravioli',
        outputCount: 2,
        hours: 12,
        level: 66,
      },
      {
        id: 'pasta-maker.lasagne',
        inputs: [
          { item: { kind: 'product', productId: 'pasta', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'pasta-sauce', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'cheese', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'lasagne',
        outputCount: 2,
        hours: 16,
        level: 68,
      },
      {
        id: 'pasta-maker.ramen',
        inputs: [
          { item: { kind: 'product', productId: 'noodles', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'bacon', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'egg', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'ramen',
        outputCount: 2,
        hours: 12,
        level: 78,
      },
      {
        id: 'pasta-maker.truffle-pasta',
        inputs: [
          { item: { kind: 'product', productId: 'pasta', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'truffle', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'cream', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'truffle-pasta',
        outputCount: 2,
        hours: 14,
        level: 78,
      },
    ],
  },
  {
    kind: 'candle-maker',
    name: 'CANDLE MAKER',
    cost: 3400,
    materials: { wood: 20, stone: 16, fibre: 12 },
    level: 74,
    queueSize: 3,
    recipes: [
      {
        id: 'candle-maker.candle',
        inputs: [
          { item: { kind: 'product', productId: 'beeswax', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'candle',
        outputCount: 2,
        hours: 8,
        level: 74,
      },
      {
        id: 'candle-maker.lantern',
        inputs: [
          { item: { kind: 'product', productId: 'candle', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'plank', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'lantern',
        outputCount: 1,
        hours: 12,
        level: 74,
      },
      {
        id: 'candle-maker.wax-polish',
        inputs: [
          { item: { kind: 'product', productId: 'beeswax', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'olive-oil', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'wax-polish',
        outputCount: 2,
        hours: 8,
        level: 74,
      },
      {
        id: 'candle-maker.scented-candle',
        inputs: [
          { item: { kind: 'product', productId: 'beeswax', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'flower-tea', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'scented-candle',
        outputCount: 2,
        hours: 10,
        level: 80,
      },
    ],
  },
  {
    kind: 'soap-maker',
    name: 'SOAP MAKER',
    cost: 3600,
    materials: { stone: 24, wood: 18, fibre: 14 },
    level: 71,
    queueSize: 3,
    recipes: [
      {
        id: 'soap-maker.lye',
        inputs: [
          { item: { kind: 'material', materialId: 'wood' }, count: 3 },
          { item: { kind: 'material', materialId: 'stone' }, count: 1 },
        ],
        outputProductId: 'lye',
        outputCount: 2,
        hours: 6,
        level: 71,
      },
      {
        id: 'soap-maker.soap',
        inputs: [
          { item: { kind: 'product', productId: 'olive-oil', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'lye', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'soap',
        outputCount: 2,
        hours: 10,
        level: 71,
      },
      {
        id: 'soap-maker.honey-soap',
        inputs: [
          { item: { kind: 'product', productId: 'soap', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'honey', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'honey-soap',
        outputCount: 2,
        hours: 8,
        level: 71,
      },
      {
        id: 'soap-maker.lotion',
        inputs: [
          { item: { kind: 'product', productId: 'coconut-oil', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'beeswax', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'lotion',
        outputCount: 2,
        hours: 10,
        level: 71,
      },
      {
        id: 'soap-maker.flower-soap',
        inputs: [
          { item: { kind: 'product', productId: 'soap', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'flower-tea', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'flower-soap',
        outputCount: 2,
        hours: 8,
        level: 80,
      },
      {
        id: 'soap-maker.luxury-soap',
        inputs: [
          { item: { kind: 'product', productId: 'honey-soap', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'lotion', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'flower-tea', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'luxury-soap',
        outputCount: 2,
        hours: 14,
        level: 89,
      },
    ],
  },
  {
    kind: 'preserves-jar',
    name: 'PRESERVES JAR',
    cost: 3000,
    materials: { stone: 20, wood: 12, fibre: 10 },
    level: 18,
    queueSize: 4,
    recipes: [
      {
        id: 'preserves-jar.sauerkraut',
        inputs: [
          { item: { kind: 'produce', cropId: 'cabbage', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'sauerkraut',
        outputCount: 1,
        hours: 20,
        level: 18,
      },
      {
        id: 'preserves-jar.pickled-radish',
        inputs: [
          { item: { kind: 'produce', cropId: 'radish', quality: 'normal' }, count: 4 },
        ],
        outputProductId: 'pickled-radish',
        outputCount: 2,
        hours: 14,
        level: 19,
      },
      {
        id: 'preserves-jar.pickles',
        inputs: [
          { item: { kind: 'produce', cropId: 'cucumber', quality: 'normal' }, count: 3 },
          { item: { kind: 'produce', cropId: 'garlic', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'pickles',
        outputCount: 2,
        hours: 16,
        level: 20,
      },
      {
        id: 'preserves-jar.pickled-peppers',
        inputs: [
          { item: { kind: 'produce', cropId: 'pepper', quality: 'normal' }, count: 3 },
          { item: { kind: 'produce', cropId: 'garlic', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'pickled-peppers',
        outputCount: 2,
        hours: 16,
        level: 21,
      },
      {
        id: 'preserves-jar.preserved-lemon',
        inputs: [
          { item: { kind: 'produce', cropId: 'lemon', quality: 'normal' }, count: 3 },
        ],
        outputProductId: 'preserved-lemon',
        outputCount: 2,
        hours: 18,
        level: 31,
      },
      {
        id: 'preserves-jar.cured-olive',
        inputs: [
          { item: { kind: 'produce', cropId: 'olive', quality: 'normal' }, count: 4 },
        ],
        outputProductId: 'cured-olive',
        outputCount: 2,
        hours: 20,
        level: 38,
      },
      {
        id: 'preserves-jar.caviar',
        inputs: [
          { item: { kind: 'product', productId: 'roe', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'caviar',
        outputCount: 1,
        hours: 24,
        level: 72,
      },
      {
        id: 'preserves-jar.golden-preserve',
        inputs: [
          { item: { kind: 'product', productId: 'royal-jelly', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'orange-marmalade', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'honey', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'golden-preserve',
        outputCount: 1,
        hours: 36,
        level: 99,
      },
    ],
  },
  {
    kind: 'ice-cream-maker',
    name: 'ICE CREAM MKR',
    cost: 7500,
    materials: { plank: 12, bolt: 14, screw: 14, stone: 20 },
    level: 65,
    queueSize: 3,
    recipes: [
      {
        id: 'ice-cream-maker.ice-cream',
        inputs: [
          { item: { kind: 'product', productId: 'cream', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'sugar', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'ice-cream',
        outputCount: 2,
        hours: 10,
        level: 66,
      },
      {
        id: 'ice-cream-maker.lemon-sorbet',
        inputs: [
          { item: { kind: 'produce', cropId: 'lemon', quality: 'normal' }, count: 3 },
          { item: { kind: 'product', productId: 'sugar', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'lemon-sorbet',
        outputCount: 2,
        hours: 9,
        level: 67,
      },
      {
        id: 'ice-cream-maker.milkshake',
        inputs: [
          { item: { kind: 'product', productId: 'ice-cream', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'milk', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'milkshake',
        outputCount: 2,
        hours: 6,
        level: 69,
      },
      {
        id: 'ice-cream-maker.mango-sorbet',
        inputs: [
          { item: { kind: 'produce', cropId: 'mango', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'sugar', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'mango-sorbet',
        outputCount: 2,
        hours: 9,
        level: 72,
      },
      {
        id: 'ice-cream-maker.strawberry-ice-cream',
        inputs: [
          { item: { kind: 'product', productId: 'ice-cream', quality: 'normal' }, count: 1 },
          { item: { kind: 'produce', cropId: 'strawberry', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'strawberry-ice-cream',
        outputCount: 2,
        hours: 8,
        level: 74,
      },
      {
        id: 'ice-cream-maker.chocolate-ice-cream',
        inputs: [
          { item: { kind: 'product', productId: 'ice-cream', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'chocolate', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'chocolate-ice-cream',
        outputCount: 2,
        hours: 8,
        level: 80,
      },
    ],
  },
  {
    kind: 'candy-machine',
    name: 'CANDY MACHINE',
    cost: 6800,
    materials: { plank: 12, bolt: 16, screw: 12, tape: 4 },
    level: 67,
    queueSize: 4,
    recipes: [
      {
        id: 'candy-machine.caramel',
        inputs: [
          { item: { kind: 'product', productId: 'sugar', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'cream', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'caramel',
        outputCount: 2,
        hours: 8,
        level: 68,
      },
      {
        id: 'candy-machine.toffee',
        inputs: [
          { item: { kind: 'product', productId: 'sugar', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'butter', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'toffee',
        outputCount: 2,
        hours: 8,
        level: 69,
      },
      {
        id: 'candy-machine.candy',
        inputs: [
          { item: { kind: 'product', productId: 'sugar', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'syrup', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'candy',
        outputCount: 3,
        hours: 10,
        level: 70,
      },
      {
        id: 'candy-machine.lollipop',
        inputs: [
          { item: { kind: 'product', productId: 'sugar', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'strawberry-jam', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'lollipop',
        outputCount: 3,
        hours: 9,
        level: 71,
      },
      {
        id: 'candy-machine.gummies',
        inputs: [
          { item: { kind: 'product', productId: 'syrup', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'grape-jelly', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'gummies',
        outputCount: 3,
        hours: 10,
        level: 74,
      },
      {
        id: 'candy-machine.nougat',
        inputs: [
          { item: { kind: 'product', productId: 'sugar', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'honey', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'egg', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'nougat',
        outputCount: 2,
        hours: 12,
        level: 76,
      },
      {
        id: 'candy-machine.fudge',
        inputs: [
          { item: { kind: 'product', productId: 'chocolate', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'condensed-milk', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'fudge',
        outputCount: 2,
        hours: 12,
        level: 84,
      },
      {
        id: 'candy-machine.candied-citrus',
        inputs: [
          { item: { kind: 'product', productId: 'preserved-lemon', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'orange-marmalade', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'sugar', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'candied-citrus',
        outputCount: 2,
        hours: 14,
        level: 97,
      },
    ],
  },
  {
    kind: 'coffee-kiosk',
    name: 'COFFEE KIOSK',
    cost: 6000,
    materials: { plank: 14, wood: 30, nail: 16 },
    level: 79,
    queueSize: 4,
    recipes: [
      {
        id: 'coffee-kiosk.black-coffee',
        inputs: [
          { item: { kind: 'produce', cropId: 'coffee', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'black-coffee',
        outputCount: 2,
        hours: 6,
        level: 79,
      },
      {
        id: 'coffee-kiosk.espresso',
        inputs: [
          { item: { kind: 'produce', cropId: 'coffee', quality: 'normal' }, count: 3 },
        ],
        outputProductId: 'espresso',
        outputCount: 2,
        hours: 8,
        level: 79,
      },
      {
        id: 'coffee-kiosk.latte',
        inputs: [
          { item: { kind: 'product', productId: 'espresso', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'milk', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'latte',
        outputCount: 1,
        hours: 4,
        level: 79,
      },
      {
        id: 'coffee-kiosk.cappuccino',
        inputs: [
          { item: { kind: 'product', productId: 'espresso', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'cream', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'cappuccino',
        outputCount: 1,
        hours: 4,
        level: 79,
      },
      {
        id: 'coffee-kiosk.cold-brew',
        inputs: [
          { item: { kind: 'produce', cropId: 'coffee', quality: 'normal' }, count: 4 },
        ],
        outputProductId: 'cold-brew',
        outputCount: 2,
        hours: 24,
        level: 79,
      },
      {
        id: 'coffee-kiosk.mocha',
        inputs: [
          { item: { kind: 'product', productId: 'espresso', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'chocolate', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'milk', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'mocha',
        outputCount: 1,
        hours: 6,
        level: 82,
      },
    ],
  },
  {
    kind: 'chocolate-works',
    name: 'CHOC WORKS',
    cost: 9000,
    materials: { plank: 16, bolt: 18, screw: 16, stone: 30 },
    level: 76,
    queueSize: 3,
    recipes: [
      {
        id: 'chocolate-works.chocolate',
        inputs: [
          { item: { kind: 'produce', cropId: 'cacao', quality: 'normal' }, count: 3 },
          { item: { kind: 'product', productId: 'milk', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'chocolate',
        outputCount: 1,
        hours: 12,
        level: 76,
      },
      {
        id: 'chocolate-works.cocoa',
        inputs: [
          { item: { kind: 'produce', cropId: 'cacao', quality: 'normal' }, count: 3 },
        ],
        outputProductId: 'cocoa',
        outputCount: 2,
        hours: 10,
        level: 76,
      },
      {
        id: 'chocolate-works.chocolate-truffle',
        inputs: [
          { item: { kind: 'product', productId: 'chocolate', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'cream', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'chocolate-truffle',
        outputCount: 2,
        hours: 14,
        level: 77,
      },
      {
        id: 'chocolate-works.hot-chocolate',
        inputs: [
          { item: { kind: 'product', productId: 'cocoa', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'milk', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'sugar', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'hot-chocolate',
        outputCount: 2,
        hours: 6,
        level: 78,
      },
      {
        id: 'chocolate-works.chocolate-bar',
        inputs: [
          { item: { kind: 'product', productId: 'chocolate', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'sugar', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'chocolate-bar',
        outputCount: 2,
        hours: 10,
        level: 80,
      },
      {
        id: 'chocolate-works.white-chocolate',
        inputs: [
          { item: { kind: 'product', productId: 'cocoa-butter', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'milk', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'sugar', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'white-chocolate',
        outputCount: 2,
        hours: 12,
        level: 84,
      },
      {
        id: 'chocolate-works.praline',
        inputs: [
          { item: { kind: 'product', productId: 'chocolate', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'caramel', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'praline',
        outputCount: 2,
        hours: 12,
        level: 88,
      },
      {
        id: 'chocolate-works.truffle-bar',
        inputs: [
          { item: { kind: 'product', productId: 'chocolate-bar', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'truffle', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'truffle-bar',
        outputCount: 2,
        hours: 16,
        level: 86,
      },
      {
        id: 'chocolate-works.spiced-chocolate',
        inputs: [
          { item: { kind: 'product', productId: 'chocolate-bar', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'cocoa', quality: 'normal' }, count: 1 },
          { item: { kind: 'produce', cropId: 'chilli', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'spiced-chocolate',
        outputCount: 2,
        hours: 14,
        level: 91,
      },
    ],
  },
  {
    kind: 'tea-house',
    name: 'TEA HOUSE',
    cost: 5200,
    materials: { plank: 12, wood: 26, fibre: 14 },
    level: 80,
    queueSize: 4,
    recipes: [
      {
        id: 'tea-house.flower-tea',
        inputs: [
          { item: { kind: 'produce', cropId: 'snowdrop', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'flower-tea',
        outputCount: 2,
        hours: 8,
        level: 80,
      },
      {
        id: 'tea-house.berry-infusion',
        inputs: [
          { item: { kind: 'produce', cropId: 'blackberry', quality: 'normal' }, count: 3 },
        ],
        outputProductId: 'berry-infusion',
        outputCount: 2,
        hours: 8,
        level: 80,
      },
      {
        id: 'tea-house.lemon-tea',
        inputs: [
          { item: { kind: 'produce', cropId: 'lemon', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'honey', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'lemon-tea',
        outputCount: 2,
        hours: 6,
        level: 80,
      },
      {
        id: 'tea-house.iced-tea',
        inputs: [
          { item: { kind: 'product', productId: 'flower-tea', quality: 'normal' }, count: 1 },
          { item: { kind: 'produce', cropId: 'lemon', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'sugar', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'iced-tea',
        outputCount: 2,
        hours: 6,
        level: 80,
      },
      {
        id: 'tea-house.chai-tea',
        inputs: [
          { item: { kind: 'product', productId: 'flower-tea', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'milk', quality: 'normal' }, count: 1 },
          { item: { kind: 'product', productId: 'sugar', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'chai-tea',
        outputCount: 2,
        hours: 8,
        level: 84,
      },
    ],
  },
  {
    kind: 'smelter',
    name: 'SMELTER',
    cost: 8000,
    materials: { stone: 60, plank: 10, bolt: 20, nail: 20 },
    level: 70,
    queueSize: 3,
    recipes: [
      {
        id: 'smelter.copper-bar',
        inputs: [
          { item: { kind: 'product', productId: 'copper-ore', quality: 'normal' }, count: 4 },
          { item: { kind: 'product', productId: 'charcoal', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'copper-bar',
        outputCount: 1,
        hours: 10,
        level: 70,
      },
      {
        id: 'smelter.iron-bar',
        inputs: [
          { item: { kind: 'product', productId: 'iron-ore', quality: 'normal' }, count: 4 },
          { item: { kind: 'product', productId: 'charcoal', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'iron-bar',
        outputCount: 1,
        hours: 14,
        level: 72,
      },
      {
        id: 'smelter.glass',
        inputs: [
          { item: { kind: 'material', materialId: 'stone' }, count: 3 },
          { item: { kind: 'product', productId: 'charcoal', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'glass',
        outputCount: 2,
        hours: 12,
        level: 71,
      },
      {
        id: 'smelter.gold-bar',
        inputs: [
          { item: { kind: 'product', productId: 'gold-ore', quality: 'normal' }, count: 4 },
          { item: { kind: 'product', productId: 'charcoal', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'gold-bar',
        outputCount: 1,
        hours: 20,
        level: 76,
      },
      {
        id: 'smelter.steel-bar',
        inputs: [
          { item: { kind: 'product', productId: 'iron-bar', quality: 'normal' }, count: 2 },
          { item: { kind: 'product', productId: 'charcoal', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'steel-bar',
        outputCount: 1,
        hours: 24,
        level: 82,
      },
    ],
  },
  {
    kind: 'keg',
    name: 'KEG',
    cost: 5000,
    materials: { plank: 14, wood: 40, bolt: 10, mallet: 1 },
    level: 88,
    queueSize: 2,
    recipes: [
      {
        id: 'keg.wine',
        inputs: [
          { item: { kind: 'produce', cropId: 'grape', quality: 'normal' }, count: 4 },
        ],
        outputProductId: 'wine',
        outputCount: 1,
        hours: 72,
        level: 88,
      },
      {
        id: 'keg.cider',
        inputs: [
          { item: { kind: 'produce', cropId: 'apple', quality: 'normal' }, count: 4 },
        ],
        outputProductId: 'cider',
        outputCount: 1,
        hours: 60,
        level: 88,
      },
      {
        id: 'keg.plum-wine',
        inputs: [
          { item: { kind: 'produce', cropId: 'plum', quality: 'normal' }, count: 4 },
        ],
        outputProductId: 'plum-wine',
        outputCount: 1,
        hours: 72,
        level: 88,
      },
      {
        id: 'keg.mead',
        inputs: [
          { item: { kind: 'product', productId: 'honey', quality: 'normal' }, count: 3 },
        ],
        outputProductId: 'mead',
        outputCount: 1,
        hours: 60,
        level: 90,
      },
      {
        id: 'keg.ale',
        inputs: [
          { item: { kind: 'product', productId: 'malt', quality: 'normal' }, count: 3 },
        ],
        outputProductId: 'ale',
        outputCount: 1,
        hours: 48,
        level: 92,
      },
      {
        id: 'keg.vinegar',
        inputs: [
          { item: { kind: 'product', productId: 'cider', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'vinegar',
        outputCount: 2,
        hours: 36,
        level: 94,
      },
      {
        id: 'keg.vintage-wine',
        inputs: [
          { item: { kind: 'product', productId: 'wine', quality: 'normal' }, count: 1 },
        ],
        outputProductId: 'vintage-wine',
        outputCount: 1,
        hours: 96,
        level: 93,
      },
      {
        id: 'keg.reserve-wine',
        inputs: [
          { item: { kind: 'product', productId: 'vintage-wine', quality: 'normal' }, count: 2 },
        ],
        outputProductId: 'reserve-wine',
        outputCount: 1,
        hours: 120,
        level: 100,
      },
    ],
  },
]

const BY_KIND: ReadonlyMap<MachineKind, MachineDef> = new Map(MACHINES.map((m) => [m.kind, m]))

const BY_RECIPE: ReadonlyMap<string, { machine: MachineDef; recipe: Recipe }> = new Map(
  MACHINES.flatMap((m) => m.recipes.map((r) => [r.id, { machine: m, recipe: r }] as const)),
)

export function machineById(kind: MachineKind): MachineDef | undefined {
  return BY_KIND.get(kind)
}

/** Throws if the kind is unknown. Use where a missing machine is a programming error. */
export function requireMachine(kind: MachineKind): MachineDef {
  const machine = BY_KIND.get(kind)
  if (!machine) throw new Error(`requireMachine: unknown machine "${kind}"`)
  return machine
}

export function recipeById(id: string): Recipe | undefined {
  return BY_RECIPE.get(id)?.recipe
}

/** Throws if the id is unknown. A job holding an unknown recipe id is a corrupt save. */
export function requireRecipe(id: string): Recipe {
  const found = BY_RECIPE.get(id)
  if (!found) throw new Error(`requireRecipe: unknown recipe "${id}"`)
  return found.recipe
}

/** The machine that runs this recipe. */
export function machineForRecipe(id: string): MachineDef | undefined {
  return BY_RECIPE.get(id)?.machine
}

/** Every recipe in the game, in machine order. */
export function allRecipes(): Recipe[] {
  return MACHINES.flatMap((m) => m.recipes)
}

/** Machines the player may buy at this level, cheapest first. */
export function machinesForLevel(level: number): MachineDef[] {
  return MACHINES.filter((m) => m.level <= level).sort((a, b) => a.cost - b.cost)
}

/** Recipes this machine may run at this level. A machine is placeable before every one
 *  of its recipes is unlocked, which is what makes it keep paying off as you level. */
export function recipesForLevel(kind: MachineKind, level: number): Recipe[] {
  return (BY_KIND.get(kind)?.recipes ?? []).filter((r) => r.level <= level)
}
