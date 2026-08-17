/**
 * Every sellable good that is not a raw crop: the 18 things animals and the mine
 * hand you, and the 195 things the factories in `factories.ts` make out of them.
 *
 * ## How the prices were set
 *
 * Nothing here was guessed. Every manufactured price is
 *
 * ```
 * base = round( (sum of input prices x margin  +  1.6 x hours) / outputCount )
 * ```
 *
 * with the margin rising as the chain deepens — 1.55 for the first step off a raw
 * good, 1.68 for the second, 1.82 for the third, 1.92 beyond that, and 2.20 for the
 * keg, which is what makes seven days of patience worth the tied-up machine.
 *
 * The rising margin is not decoration. It is the only thing that makes **gold returned
 * per gold of raw input** climb at every step of a chain rather than flatten out, and
 * that climb is the rule `docs/CATALOG.md` §5 sets. `chainYield()` is that number and
 * `validateEconomics()` enforces it two ways: along every chain in `REQUIRED_CHAINS`,
 * and on every single recipe against the ingredient it is mostly made of. Wheat returns
 * 1.00x, flour 1.89x, bread 2.21x, a sandwich 3.88x — so the chain is worth running at
 * every step, and running it further is always worth more than stopping.
 *
 * Rounding is to the nearest 1 below 100 g, 5 below 1000 g and 10 above, and it always
 * rounds *up* rather than let a recipe fall under 1.35x its inputs.
 *
 * ## Raw inputs
 *
 * A recipe can eat a crop, a tree fruit or a material, none of which is a product, so
 * the margin maths needs a price for those too. It reads `crops.ts` and `trees.ts`
 * directly — `RAW_CROP_VALUE` is the record of what every price below was balanced
 * against, and `validateEconomics()` warns if one of those two tables has since moved
 * more than a quarter, so the three cannot drift apart quietly.
 *
 * Contracts: docs/CATALOG.md §5, docs/ECONOMY.md §1–2, docs/GAMEPLAY.md §3.
 */
import { QUALITY_MULTIPLIER } from './constants'
import { cropById } from './crops'
import { treeById } from './trees'
import { MACHINES, allRecipes } from './factories'
import type { GoodEconomics, MachineKind, MaterialId, Recipe } from './farm-types'
import type { ItemRef, Quality } from './types'

/** Which market a good belongs to. Festival events lift a whole one of these. */
export type ProductCategory = 'animal' | 'artisan' | 'mineral'

/** The shelf a good sits on in the Almanac. Finer than the category. */
export type ProductGroup =
  | 'animal'
  | 'baked'
  | 'cooked'
  | 'craft'
  | 'dairy'
  | 'drink'
  | 'feed'
  | 'metal'
  | 'milled'
  | 'mineral'
  | 'pantry'
  | 'preserve'
  | 'snack'
  | 'sweet'
  | 'textile'
  | 'timber'

/** Parametric silhouette for the icon renderer. Goods may share a shape; the tint is
 *  unique across the whole table, which `validateEconomics()` checks. */
export type ProductShape =
  | 'bar'
  | 'board'
  | 'bolt'
  | 'bottle'
  | 'bowl'
  | 'cake'
  | 'candle'
  | 'candy'
  | 'comb'
  | 'cone'
  | 'cup'
  | 'egg'
  | 'fish'
  | 'flask'
  | 'fluff'
  | 'garment'
  | 'ingot'
  | 'jar'
  | 'loaf'
  | 'nest'
  | 'ore'
  | 'pie'
  | 'roe'
  | 'round'
  | 'sack'
  | 'skewer'
  | 'slab'
  | 'wheel'

export interface ProductArt {
  /** Body colour. Unique across every product in the game. */
  tint: string
  shape: ProductShape
}

export interface ProductDef {
  id: string
  /** Display name. The bitmap face is caps-led, so these are short. */
  name: string
  group: ProductGroup
  category: ProductCategory
  /** Level the good first becomes obtainable — the recipe's level, or the animal's. */
  level: number
  /** Machine kind that makes it, or null for something an animal or the mine gives you. */
  madeBy: MachineKind | null
  econ: GoodEconomics
  art: ProductArt
}

export const PRODUCTS: readonly ProductDef[] = [
  {
    id: 'egg',
    name: 'EGG',
    group: 'animal',
    category: 'animal',
    level: 8,
    madeBy: null,
    econ: { base: 50, elasticity: 0.30, recovery: 0.33, seasonal: { spring: 1.05, summer: 0.95, fall: 1.00, winter: 1.15 } },
    art: { tint: '#f6e2b0', shape: 'egg' },
  },
  {
    id: 'milk',
    name: 'MILK',
    group: 'animal',
    category: 'animal',
    level: 15,
    madeBy: null,
    econ: { base: 125, elasticity: 0.30, recovery: 0.33, seasonal: { spring: 1.05, summer: 0.95, fall: 1.00, winter: 1.15 } },
    art: { tint: '#f2f4f8', shape: 'bottle' },
  },
  {
    id: 'duck-egg',
    name: 'DUCK EGG',
    group: 'animal',
    category: 'animal',
    level: 26,
    madeBy: null,
    econ: { base: 95, elasticity: 0.30, recovery: 0.33, seasonal: { spring: 1.05, summer: 0.95, fall: 1.00, winter: 1.15 } },
    art: { tint: '#cfe4e0', shape: 'egg' },
  },
  {
    id: 'feather',
    name: 'FEATHER',
    group: 'animal',
    category: 'animal',
    level: 26,
    madeBy: null,
    econ: { base: 60, elasticity: 0.30, recovery: 0.33, seasonal: { spring: 1.05, summer: 0.95, fall: 1.00, winter: 1.15 } },
    art: { tint: '#c8d2dc', shape: 'fluff' },
  },
  {
    id: 'turkey-egg',
    name: 'TURKEY EGG',
    group: 'animal',
    category: 'animal',
    level: 27,
    madeBy: null,
    econ: { base: 120, elasticity: 0.30, recovery: 0.33, seasonal: { spring: 1.05, summer: 0.95, fall: 1.00, winter: 1.15 } },
    art: { tint: '#cbb086', shape: 'egg' },
  },
  {
    id: 'goat-milk',
    name: 'GOAT MILK',
    group: 'animal',
    category: 'animal',
    level: 34,
    madeBy: null,
    econ: { base: 225, elasticity: 0.30, recovery: 0.33, seasonal: { spring: 1.05, summer: 0.95, fall: 1.00, winter: 1.15 } },
    art: { tint: '#eaf0e2', shape: 'bottle' },
  },
  {
    id: 'goose-egg',
    name: 'GOOSE EGG',
    group: 'animal',
    category: 'animal',
    level: 72,
    madeBy: null,
    econ: { base: 140, elasticity: 0.30, recovery: 0.33, seasonal: { spring: 1.05, summer: 0.95, fall: 1.00, winter: 1.15 } },
    art: { tint: '#f0eac8', shape: 'egg' },
  },
  {
    id: 'down',
    name: 'DOWN',
    group: 'animal',
    category: 'animal',
    level: 72,
    madeBy: null,
    econ: { base: 110, elasticity: 0.30, recovery: 0.33, seasonal: { spring: 1.05, summer: 0.95, fall: 1.00, winter: 1.15 } },
    art: { tint: '#dcd8e8', shape: 'fluff' },
  },
  {
    id: 'wool',
    name: 'WOOL',
    group: 'animal',
    category: 'animal',
    level: 36,
    madeBy: null,
    econ: { base: 340, elasticity: 0.30, recovery: 0.33, seasonal: { spring: 1.05, summer: 0.95, fall: 1.00, winter: 1.15 } },
    art: { tint: '#ece0c8', shape: 'fluff' },
  },
  {
    id: 'honeycomb',
    name: 'HONEYCOMB',
    group: 'animal',
    category: 'animal',
    level: 30,
    madeBy: null,
    econ: { base: 180, elasticity: 0.30, recovery: 0.33, seasonal: { spring: 1.05, summer: 0.95, fall: 1.00, winter: 1.15 } },
    art: { tint: '#d99b33', shape: 'comb' },
  },
  {
    id: 'fish',
    name: 'FISH',
    group: 'animal',
    category: 'animal',
    level: 48,
    madeBy: null,
    econ: { base: 95, elasticity: 0.30, recovery: 0.33, seasonal: { spring: 1.05, summer: 0.95, fall: 1.00, winter: 1.15 } },
    art: { tint: '#7f96a8', shape: 'fish' },
  },
  {
    id: 'roe',
    name: 'ROE',
    group: 'animal',
    category: 'animal',
    level: 48,
    madeBy: null,
    econ: { base: 150, elasticity: 0.85, recovery: 0.15, seasonal: { spring: 1.05, summer: 0.95, fall: 1.00, winter: 1.15 } },
    art: { tint: '#e0703c', shape: 'roe' },
  },
  {
    id: 'angora-wool',
    name: 'ANGORA WOOL',
    group: 'animal',
    category: 'animal',
    level: 74,
    madeBy: null,
    econ: { base: 380, elasticity: 0.30, recovery: 0.33, seasonal: { spring: 1.05, summer: 0.95, fall: 1.00, winter: 1.15 } },
    art: { tint: '#f6eef6', shape: 'fluff' },
  },
  {
    id: 'bacon',
    name: 'BACON',
    group: 'animal',
    category: 'animal',
    level: 78,
    madeBy: null,
    econ: { base: 210, elasticity: 0.30, recovery: 0.33, seasonal: { spring: 1.05, summer: 0.95, fall: 1.00, winter: 1.15 } },
    art: { tint: '#c0554f', shape: 'slab' },
  },
  {
    id: 'truffle',
    name: 'TRUFFLE',
    group: 'animal',
    category: 'animal',
    level: 78,
    madeBy: null,
    econ: { base: 625, elasticity: 0.85, recovery: 0.15, seasonal: { spring: 1.05, summer: 0.95, fall: 1.00, winter: 1.15 } },
    art: { tint: '#4a3a2e', shape: 'round' },
  },
  {
    id: 'copper-ore',
    name: 'COPPER ORE',
    group: 'mineral',
    category: 'mineral',
    level: 68,
    madeBy: null,
    econ: { base: 25, elasticity: 0.45, recovery: 0.25, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#b06a3a', shape: 'ore' },
  },
  {
    id: 'iron-ore',
    name: 'IRON ORE',
    group: 'mineral',
    category: 'mineral',
    level: 70,
    madeBy: null,
    econ: { base: 40, elasticity: 0.45, recovery: 0.25, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#8d8f94', shape: 'ore' },
  },
  {
    id: 'gold-ore',
    name: 'GOLD ORE',
    group: 'mineral',
    category: 'mineral',
    level: 74,
    madeBy: null,
    econ: { base: 90, elasticity: 0.45, recovery: 0.25, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#d4a72c', shape: 'ore' },
  },
  {
    id: 'animal-feed',
    name: 'ANIMAL FEED',
    group: 'feed',
    category: 'artisan',
    level: 6,
    madeBy: 'feed-mill',
    econ: { base: 16, elasticity: 0.30, recovery: 0.30, seasonal: { spring: 0.85, summer: 0.90, fall: 1.15, winter: 1.20 } },
    art: { tint: '#dca96a', shape: 'sack' },
  },
  {
    id: 'straw-bale',
    name: 'STRAW BALE',
    group: 'feed',
    category: 'artisan',
    level: 6,
    madeBy: 'feed-mill',
    econ: { base: 16, elasticity: 0.30, recovery: 0.30, seasonal: { spring: 0.85, summer: 0.90, fall: 1.15, winter: 1.20 } },
    art: { tint: '#d7af54', shape: 'sack' },
  },
  {
    id: 'chicken-mash',
    name: 'CHICK MASH',
    group: 'feed',
    category: 'artisan',
    level: 22,
    madeBy: 'feed-mill',
    econ: { base: 23, elasticity: 0.30, recovery: 0.30, seasonal: { spring: 0.85, summer: 0.90, fall: 1.15, winter: 1.20 } },
    art: { tint: '#d1bb3d', shape: 'sack' },
  },
  {
    id: 'fish-meal',
    name: 'FISH MEAL',
    group: 'feed',
    category: 'artisan',
    level: 48,
    madeBy: 'feed-mill',
    econ: { base: 150, elasticity: 0.30, recovery: 0.30, seasonal: { spring: 0.85, summer: 0.90, fall: 1.15, winter: 1.20 } },
    art: { tint: '#b77f3b', shape: 'sack' },
  },
  {
    id: 'rich-feed',
    name: 'RICH FEED',
    group: 'feed',
    category: 'artisan',
    level: 44,
    madeBy: 'feed-mill',
    econ: { base: 120, elasticity: 0.30, recovery: 0.30, seasonal: { spring: 0.85, summer: 0.90, fall: 1.15, winter: 1.20 } },
    art: { tint: '#a28134', shape: 'sack' },
  },
  {
    id: 'plank',
    name: 'PLANK',
    group: 'timber',
    category: 'artisan',
    level: 20,
    madeBy: 'sawmill',
    econ: { base: 17, elasticity: 0.28, recovery: 0.32, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#dc8e6a', shape: 'board' },
  },
  {
    id: 'shingle',
    name: 'SHINGLE',
    group: 'timber',
    category: 'artisan',
    level: 20,
    madeBy: 'sawmill',
    econ: { base: 8, elasticity: 0.28, recovery: 0.32, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#d79154', shape: 'board' },
  },
  {
    id: 'beam',
    name: 'BEAM',
    group: 'timber',
    category: 'artisan',
    level: 20,
    madeBy: 'sawmill',
    econ: { base: 58, elasticity: 0.28, recovery: 0.32, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#d1983d', shape: 'board' },
  },
  {
    id: 'charcoal',
    name: 'CHARCOAL',
    group: 'timber',
    category: 'artisan',
    level: 20,
    madeBy: 'sawmill',
    econ: { base: 27, elasticity: 0.28, recovery: 0.32, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#b7623b', shape: 'board' },
  },
  {
    id: 'flour',
    name: 'FLOUR',
    group: 'milled',
    category: 'artisan',
    level: 12,
    madeBy: 'mill',
    econ: { base: 17, elasticity: 0.35, recovery: 0.28, seasonal: { spring: 0.95, summer: 0.90, fall: 1.30, winter: 0.95 } },
    art: { tint: '#dcb46a', shape: 'sack' },
  },
  {
    id: 'cornmeal',
    name: 'CORNMEAL',
    group: 'milled',
    category: 'artisan',
    level: 12,
    madeBy: 'mill',
    econ: { base: 15, elasticity: 0.35, recovery: 0.28, seasonal: { spring: 0.95, summer: 0.90, fall: 1.30, winter: 0.95 } },
    art: { tint: '#d7bd54', shape: 'sack' },
  },
  {
    id: 'rice-flour',
    name: 'RICE FLOUR',
    group: 'milled',
    category: 'artisan',
    level: 26,
    madeBy: 'mill',
    econ: { base: 51, elasticity: 0.35, recovery: 0.28, seasonal: { spring: 0.95, summer: 0.90, fall: 1.30, winter: 0.95 } },
    art: { tint: '#d1ca3d', shape: 'sack' },
  },
  {
    id: 'malt',
    name: 'MALT',
    group: 'milled',
    category: 'artisan',
    level: 26,
    madeBy: 'mill',
    econ: { base: 42, elasticity: 0.35, recovery: 0.28, seasonal: { spring: 0.95, summer: 0.90, fall: 1.30, winter: 0.95 } },
    art: { tint: '#b78c3b', shape: 'sack' },
  },
  {
    id: 'cream',
    name: 'CREAM',
    group: 'dairy',
    category: 'artisan',
    level: 15,
    madeBy: 'dairy',
    econ: { base: 200, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#dcbc6a', shape: 'wheel' },
  },
  {
    id: 'yoghurt',
    name: 'YOGHURT',
    group: 'dairy',
    category: 'artisan',
    level: 17,
    madeBy: 'dairy',
    econ: { base: 200, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#d7c554', shape: 'wheel' },
  },
  {
    id: 'cheese',
    name: 'CHEESE',
    group: 'dairy',
    category: 'artisan',
    level: 41,
    madeBy: 'dairy',
    econ: { base: 560, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#cfd13d', shape: 'wheel' },
  },
  {
    id: 'butter',
    name: 'BUTTER',
    group: 'dairy',
    category: 'artisan',
    level: 21,
    madeBy: 'dairy',
    econ: { base: 680, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#b7943b', shape: 'wheel' },
  },
  {
    id: 'goat-cheese',
    name: 'GOAT CHEESE',
    group: 'dairy',
    category: 'artisan',
    level: 40,
    madeBy: 'dairy',
    econ: { base: 715, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#a29334', shape: 'wheel' },
  },
  {
    id: 'condensed-milk',
    name: 'COND MILK',
    group: 'dairy',
    category: 'artisan',
    level: 44,
    madeBy: 'dairy',
    econ: { base: 460, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#d0d274', shape: 'wheel' },
  },
  {
    id: 'aged-cheese',
    name: 'AGED CHEESE',
    group: 'dairy',
    category: 'artisan',
    level: 85,
    madeBy: 'dairy',
    econ: { base: 2120, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#c0a86b', shape: 'wheel' },
  },
  {
    id: 'bread',
    name: 'BREAD',
    group: 'baked',
    category: 'artisan',
    level: 22,
    madeBy: 'bakery',
    econ: { base: 150, elasticity: 0.45, recovery: 0.22, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#dc966a', shape: 'loaf' },
  },
  {
    id: 'cookies',
    name: 'COOKIES',
    group: 'baked',
    category: 'artisan',
    level: 34,
    madeBy: 'bakery',
    econ: { base: 500, elasticity: 0.45, recovery: 0.22, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#d79a54', shape: 'loaf' },
  },
  {
    id: 'donut',
    name: 'DONUT',
    group: 'baked',
    category: 'artisan',
    level: 44,
    madeBy: 'bakery',
    econ: { base: 185, elasticity: 0.45, recovery: 0.22, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#d1a23d', shape: 'loaf' },
  },
  {
    id: 'banana-bread',
    name: 'BANANA LOAF',
    group: 'baked',
    category: 'artisan',
    level: 54,
    madeBy: 'bakery',
    econ: { base: 760, elasticity: 0.45, recovery: 0.22, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#b76b3b', shape: 'loaf' },
  },
  {
    id: 'croissant',
    name: 'CROISSANT',
    group: 'baked',
    category: 'artisan',
    level: 40,
    madeBy: 'bakery',
    econ: { base: 850, elasticity: 0.45, recovery: 0.22, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#a26f34', shape: 'loaf' },
  },
  {
    id: 'cake',
    name: 'CAKE',
    group: 'baked',
    category: 'artisan',
    level: 81,
    madeBy: 'bakery',
    econ: { base: 2840, elasticity: 0.45, recovery: 0.22, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#d2b474', shape: 'loaf' },
  },
  {
    id: 'pizza',
    name: 'PIZZA',
    group: 'baked',
    category: 'artisan',
    level: 56,
    madeBy: 'bakery',
    econ: { base: 670, elasticity: 0.45, recovery: 0.22, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#c08b6b', shape: 'loaf' },
  },
  {
    id: 'sandwich',
    name: 'SANDWICH',
    group: 'baked',
    category: 'artisan',
    level: 64,
    madeBy: 'bakery',
    econ: { base: 675, elasticity: 0.45, recovery: 0.22, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#b78a57', shape: 'loaf' },
  },
  {
    id: 'gourmet-pizza',
    name: 'GRAND PIZZA',
    group: 'baked',
    category: 'artisan',
    level: 87,
    madeBy: 'bakery',
    econ: { base: 3880, elasticity: 0.45, recovery: 0.22, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#aa8b49', shape: 'loaf' },
  },
  {
    id: 'apple-pie',
    name: 'APPLE PIE',
    group: 'baked',
    category: 'artisan',
    level: 47,
    madeBy: 'pie-oven',
    econ: { base: 185, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 0.95, summer: 0.90, fall: 1.30, winter: 0.95 } },
    art: { tint: '#dc7f6a', shape: 'pie' },
  },
  {
    id: 'pumpkin-pie',
    name: 'PUMPKIN PIE',
    group: 'baked',
    category: 'artisan',
    level: 47,
    madeBy: 'pie-oven',
    econ: { base: 405, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 0.95, summer: 0.90, fall: 1.30, winter: 0.95 } },
    art: { tint: '#d77f54', shape: 'pie' },
  },
  {
    id: 'berry-pie',
    name: 'BERRY PIE',
    group: 'baked',
    category: 'artisan',
    level: 47,
    madeBy: 'pie-oven',
    econ: { base: 125, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 0.95, summer: 0.90, fall: 1.30, winter: 0.95 } },
    art: { tint: '#d1853d', shape: 'pie' },
  },
  {
    id: 'quiche',
    name: 'QUICHE',
    group: 'baked',
    category: 'artisan',
    level: 47,
    madeBy: 'pie-oven',
    econ: { base: 625, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 0.95, summer: 0.90, fall: 1.30, winter: 0.95 } },
    art: { tint: '#b7523b', shape: 'pie' },
  },
  {
    id: 'custard-tart',
    name: 'CUSTARD TART',
    group: 'baked',
    category: 'artisan',
    level: 47,
    madeBy: 'pie-oven',
    econ: { base: 350, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 0.95, summer: 0.90, fall: 1.30, winter: 0.95 } },
    art: { tint: '#a25934', shape: 'pie' },
  },
  {
    id: 'cherry-tart',
    name: 'CHERRY TART',
    group: 'baked',
    category: 'artisan',
    level: 47,
    madeBy: 'pie-oven',
    econ: { base: 750, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 0.95, summer: 0.90, fall: 1.30, winter: 0.95 } },
    art: { tint: '#d2a274', shape: 'pie' },
  },
  {
    id: 'meat-pie',
    name: 'MEAT PIE',
    group: 'baked',
    category: 'artisan',
    level: 78,
    madeBy: 'pie-oven',
    econ: { base: 430, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 0.95, summer: 0.90, fall: 1.30, winter: 0.95 } },
    art: { tint: '#c07a6b', shape: 'pie' },
  },
  {
    id: 'syrup',
    name: 'SYRUP',
    group: 'pantry',
    category: 'artisan',
    level: 30,
    madeBy: 'sugar-mill',
    econ: { base: 33, elasticity: 0.40, recovery: 0.25, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#dca56a', shape: 'sack' },
  },
  {
    id: 'sugar',
    name: 'SUGAR',
    group: 'pantry',
    category: 'artisan',
    level: 32,
    madeBy: 'sugar-mill',
    econ: { base: 125, elasticity: 0.40, recovery: 0.25, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#d7ab54', shape: 'sack' },
  },
  {
    id: 'molasses',
    name: 'MOLASSES',
    group: 'pantry',
    category: 'artisan',
    level: 30,
    madeBy: 'sugar-mill',
    econ: { base: 91, elasticity: 0.40, recovery: 0.25, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#d1b63d', shape: 'sack' },
  },
  {
    id: 'brown-sugar',
    name: 'BROWN SUGAR',
    group: 'pantry',
    category: 'artisan',
    level: 44,
    madeBy: 'sugar-mill',
    econ: { base: 200, elasticity: 0.40, recovery: 0.25, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#b77b3b', shape: 'sack' },
  },
  {
    id: 'strawberry-jam',
    name: 'STRAWB JAM',
    group: 'preserve',
    category: 'artisan',
    level: 26,
    madeBy: 'jam-maker',
    econ: { base: 185, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 1.30, summer: 1.05, fall: 0.85, winter: 0.85 } },
    art: { tint: '#dc6a83', shape: 'jar' },
  },
  {
    id: 'blackberry-jam',
    name: 'BRAMBLE JAM',
    group: 'preserve',
    category: 'artisan',
    level: 26,
    madeBy: 'jam-maker',
    econ: { base: 105, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 1.30, summer: 1.05, fall: 0.85, winter: 0.85 } },
    art: { tint: '#af54d7', shape: 'jar' },
  },
  {
    id: 'raspberry-jam',
    name: 'RASPB JAM',
    group: 'preserve',
    category: 'artisan',
    level: 27,
    madeBy: 'jam-maker',
    econ: { base: 94, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 1.30, summer: 1.05, fall: 0.85, winter: 0.85 } },
    art: { tint: '#d13d49', shape: 'jar' },
  },
  {
    id: 'grape-jelly',
    name: 'GRAPE JELLY',
    group: 'preserve',
    category: 'artisan',
    level: 28,
    madeBy: 'jam-maker',
    econ: { base: 195, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 1.30, summer: 1.05, fall: 0.85, winter: 0.85 } },
    art: { tint: '#8c3bb7', shape: 'jar' },
  },
  {
    id: 'peach-jam',
    name: 'PEACH JAM',
    group: 'preserve',
    category: 'artisan',
    level: 30,
    madeBy: 'jam-maker',
    econ: { base: 300, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 1.30, summer: 1.05, fall: 0.85, winter: 0.85 } },
    art: { tint: '#a26034', shape: 'jar' },
  },
  {
    id: 'plum-jam',
    name: 'PLUM JAM',
    group: 'preserve',
    category: 'artisan',
    level: 31,
    madeBy: 'jam-maker',
    econ: { base: 170, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 1.30, summer: 1.05, fall: 0.85, winter: 0.85 } },
    art: { tint: '#d274b1', shape: 'jar' },
  },
  {
    id: 'mango-jam',
    name: 'MANGO JAM',
    group: 'preserve',
    category: 'artisan',
    level: 48,
    madeBy: 'jam-maker',
    econ: { base: 355, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 1.30, summer: 1.05, fall: 0.85, winter: 0.85 } },
    art: { tint: '#c0916b', shape: 'jar' },
  },
  {
    id: 'orange-marmalade',
    name: 'MARMALADE',
    group: 'preserve',
    category: 'artisan',
    level: 38,
    madeBy: 'jam-maker',
    econ: { base: 540, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 1.30, summer: 1.05, fall: 0.85, winter: 0.85 } },
    art: { tint: '#b78757', shape: 'jar' },
  },
  {
    id: 'carrot-juice',
    name: 'CARROT JUICE',
    group: 'drink',
    category: 'artisan',
    level: 35,
    madeBy: 'juice-press',
    econ: { base: 56, elasticity: 0.65, recovery: 0.20, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#dc8b6a', shape: 'bottle' },
  },
  {
    id: 'apple-juice',
    name: 'APPLE JUICE',
    group: 'drink',
    category: 'artisan',
    level: 35,
    madeBy: 'juice-press',
    econ: { base: 145, elasticity: 0.65, recovery: 0.20, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#a7d754', shape: 'bottle' },
  },
  {
    id: 'orange-juice',
    name: 'ORANGE JUICE',
    group: 'drink',
    category: 'artisan',
    level: 35,
    madeBy: 'juice-press',
    econ: { base: 190, elasticity: 0.65, recovery: 0.20, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#d2a33f', shape: 'bottle' },
  },
  {
    id: 'grape-juice',
    name: 'GRAPE JUICE',
    group: 'drink',
    category: 'artisan',
    level: 35,
    madeBy: 'juice-press',
    econ: { base: 92, elasticity: 0.65, recovery: 0.20, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#883bb7', shape: 'bottle' },
  },
  {
    id: 'lemonade',
    name: 'LEMONADE',
    group: 'drink',
    category: 'artisan',
    level: 40,
    madeBy: 'juice-press',
    econ: { base: 145, elasticity: 0.65, recovery: 0.20, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#a29734', shape: 'bottle' },
  },
  {
    id: 'berry-smoothie',
    name: 'BERRY SMOOTH',
    group: 'drink',
    category: 'artisan',
    level: 44,
    madeBy: 'juice-press',
    econ: { base: 235, elasticity: 0.65, recovery: 0.20, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#d27486', shape: 'bottle' },
  },
  {
    id: 'melon-smoothie',
    name: 'MELON SMOOTH',
    group: 'drink',
    category: 'artisan',
    level: 46,
    madeBy: 'juice-press',
    econ: { base: 325, elasticity: 0.65, recovery: 0.20, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#8ec06b', shape: 'bottle' },
  },
  {
    id: 'olive-oil',
    name: 'OLIVE OIL',
    group: 'pantry',
    category: 'artisan',
    level: 43,
    madeBy: 'oil-press',
    econ: { base: 175, elasticity: 0.50, recovery: 0.22, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#dadc6a', shape: 'bottle' },
  },
  {
    id: 'cooking-oil',
    name: 'COOKING OIL',
    group: 'pantry',
    category: 'artisan',
    level: 44,
    madeBy: 'oil-press',
    econ: { base: 55, elasticity: 0.50, recovery: 0.22, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#c1d754', shape: 'bottle' },
  },
  {
    id: 'coconut-oil',
    name: 'COCONUT OIL',
    group: 'pantry',
    category: 'artisan',
    level: 48,
    madeBy: 'oil-press',
    econ: { base: 315, elasticity: 0.50, recovery: 0.22, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#a2d13d', shape: 'bottle' },
  },
  {
    id: 'cocoa-butter',
    name: 'COCOA BUTTER',
    group: 'pantry',
    category: 'artisan',
    level: 60,
    madeBy: 'oil-press',
    econ: { base: 215, elasticity: 0.50, recovery: 0.22, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#b5b73b', shape: 'bottle' },
  },
  {
    id: 'truffle-oil',
    name: 'TRUFFLE OIL',
    group: 'pantry',
    category: 'artisan',
    level: 78,
    madeBy: 'oil-press',
    econ: { base: 580, elasticity: 0.50, recovery: 0.22, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#90a234', shape: 'bottle' },
  },
  {
    id: 'cloth',
    name: 'CLOTH',
    group: 'textile',
    category: 'artisan',
    level: 38,
    madeBy: 'loom',
    econ: { base: 795, elasticity: 0.50, recovery: 0.20, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#6ac7dc', shape: 'bolt' },
  },
  {
    id: 'cotton-cloth',
    name: 'COTTON CLOTH',
    group: 'textile',
    category: 'artisan',
    level: 31,
    madeBy: 'loom',
    econ: { base: 99, elasticity: 0.50, recovery: 0.20, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#54abd7', shape: 'bolt' },
  },
  {
    id: 'fabric',
    name: 'FABRIC',
    group: 'textile',
    category: 'artisan',
    level: 84,
    madeBy: 'loom',
    econ: { base: 1470, elasticity: 0.50, recovery: 0.20, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#3d8ad1', shape: 'bolt' },
  },
  {
    id: 'angora-yarn',
    name: 'ANGORA YARN',
    group: 'textile',
    category: 'artisan',
    level: 74,
    madeBy: 'loom',
    econ: { base: 595, elasticity: 0.50, recovery: 0.20, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#3ba0b7', shape: 'bolt' },
  },
  {
    id: 'lace',
    name: 'LACE',
    group: 'textile',
    category: 'artisan',
    level: 58,
    madeBy: 'loom',
    econ: { base: 370, elasticity: 0.50, recovery: 0.20, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#347da2', shape: 'bolt' },
  },
  {
    id: 'rug',
    name: 'RUG',
    group: 'textile',
    category: 'artisan',
    level: 62,
    madeBy: 'loom',
    econ: { base: 4240, elasticity: 0.50, recovery: 0.20, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#74a5d2', shape: 'bolt' },
  },
  {
    id: 'clothing',
    name: 'CLOTHING',
    group: 'textile',
    category: 'artisan',
    level: 40,
    madeBy: 'sewing-machine',
    econ: { base: 2690, elasticity: 0.70, recovery: 0.16, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#6aa1dc', shape: 'garment' },
  },
  {
    id: 'hat',
    name: 'HAT',
    group: 'textile',
    category: 'artisan',
    level: 40,
    madeBy: 'sewing-machine',
    econ: { base: 1450, elasticity: 0.70, recovery: 0.16, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#547fd7', shape: 'garment' },
  },
  {
    id: 'sun-hat',
    name: 'SUN HAT',
    group: 'textile',
    category: 'artisan',
    level: 45,
    madeBy: 'sewing-machine',
    econ: { base: 405, elasticity: 0.70, recovery: 0.16, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#3d58d1', shape: 'garment' },
  },
  {
    id: 'bag',
    name: 'BAG',
    group: 'textile',
    category: 'artisan',
    level: 84,
    madeBy: 'sewing-machine',
    econ: { base: 3050, elasticity: 0.70, recovery: 0.16, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#3b77b7', shape: 'garment' },
  },
  {
    id: 'scarf',
    name: 'SCARF',
    group: 'textile',
    category: 'artisan',
    level: 74,
    madeBy: 'sewing-machine',
    econ: { base: 2020, elasticity: 0.70, recovery: 0.16, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#3459a2', shape: 'garment' },
  },
  {
    id: 'dress',
    name: 'DRESS',
    group: 'textile',
    category: 'artisan',
    level: 84,
    madeBy: 'sewing-machine',
    econ: { base: 6050, elasticity: 0.70, recovery: 0.16, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#7486d2', shape: 'garment' },
  },
  {
    id: 'robe',
    name: 'ROBE',
    group: 'textile',
    category: 'artisan',
    level: 84,
    madeBy: 'sewing-machine',
    econ: { base: 5790, elasticity: 0.70, recovery: 0.16, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#6b94c0', shape: 'garment' },
  },
  {
    id: 'quilt',
    name: 'QUILT',
    group: 'textile',
    category: 'artisan',
    level: 84,
    madeBy: 'sewing-machine',
    econ: { base: 8470, elasticity: 0.70, recovery: 0.16, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#5777b7', shape: 'garment' },
  },
  {
    id: 'silk-gown',
    name: 'SILK GOWN',
    group: 'textile',
    category: 'artisan',
    level: 96,
    madeBy: 'sewing-machine',
    econ: { base: 12810, elasticity: 0.70, recovery: 0.16, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#495aaa', shape: 'garment' },
  },
  {
    id: 'indigo-dye',
    name: 'INDIGO DYE',
    group: 'craft',
    category: 'artisan',
    level: 46,
    madeBy: 'dye-vat',
    econ: { base: 145, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 1.30, summer: 1.05, fall: 0.85, winter: 0.85 } },
    art: { tint: '#6a9edc', shape: 'flask' },
  },
  {
    id: 'red-dye',
    name: 'RED DYE',
    group: 'craft',
    category: 'artisan',
    level: 45,
    madeBy: 'dye-vat',
    econ: { base: 120, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 1.30, summer: 1.05, fall: 0.85, winter: 0.85 } },
    art: { tint: '#d75854', shape: 'flask' },
  },
  {
    id: 'yellow-dye',
    name: 'YELLOW DYE',
    group: 'craft',
    category: 'artisan',
    level: 45,
    madeBy: 'dye-vat',
    econ: { base: 135, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 1.30, summer: 1.05, fall: 0.85, winter: 0.85 } },
    art: { tint: '#d1cf3d', shape: 'flask' },
  },
  {
    id: 'pink-dye',
    name: 'PINK DYE',
    group: 'craft',
    category: 'artisan',
    level: 45,
    madeBy: 'dye-vat',
    econ: { base: 110, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 1.30, summer: 1.05, fall: 0.85, winter: 0.85 } },
    art: { tint: '#b73b88', shape: 'flask' },
  },
  {
    id: 'purple-dye',
    name: 'PURPLE DYE',
    group: 'craft',
    category: 'artisan',
    level: 48,
    madeBy: 'dye-vat',
    econ: { base: 225, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 1.30, summer: 1.05, fall: 0.85, winter: 0.85 } },
    art: { tint: '#7a34a2', shape: 'flask' },
  },
  {
    id: 'ink',
    name: 'INK',
    group: 'craft',
    category: 'artisan',
    level: 52,
    madeBy: 'dye-vat',
    econ: { base: 550, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 1.30, summer: 1.05, fall: 0.85, winter: 0.85 } },
    art: { tint: '#7f74d2', shape: 'flask' },
  },
  {
    id: 'honey',
    name: 'HONEY',
    group: 'pantry',
    category: 'artisan',
    level: 30,
    madeBy: 'honey-extractor',
    econ: { base: 285, elasticity: 0.50, recovery: 0.22, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#dcaf6a', shape: 'jar' },
  },
  {
    id: 'beeswax',
    name: 'BEESWAX',
    group: 'pantry',
    category: 'artisan',
    level: 30,
    madeBy: 'honey-extractor',
    econ: { base: 290, elasticity: 0.50, recovery: 0.22, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#d7b654', shape: 'jar' },
  },
  {
    id: 'royal-jelly',
    name: 'ROYAL JELLY',
    group: 'pantry',
    category: 'artisan',
    level: 60,
    madeBy: 'honey-extractor',
    econ: { base: 1150, elasticity: 0.50, recovery: 0.22, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#d1c33d', shape: 'jar' },
  },
  {
    id: 'honey-butter',
    name: 'HONEY BUTTER',
    group: 'pantry',
    category: 'artisan',
    level: 62,
    madeBy: 'honey-extractor',
    econ: { base: 885, elasticity: 0.50, recovery: 0.22, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#b7853b', shape: 'jar' },
  },
  {
    id: 'popcorn',
    name: 'POPCORN',
    group: 'snack',
    category: 'artisan',
    level: 61,
    madeBy: 'popcorn-pot',
    econ: { base: 7, elasticity: 0.50, recovery: 0.28, seasonal: { spring: 0.95, summer: 0.90, fall: 1.30, winter: 0.95 } },
    art: { tint: '#dcb86a', shape: 'sack' },
  },
  {
    id: 'kettle-corn',
    name: 'KETTLE CORN',
    group: 'snack',
    category: 'artisan',
    level: 62,
    madeBy: 'popcorn-pot',
    econ: { base: 85, elasticity: 0.50, recovery: 0.28, seasonal: { spring: 0.95, summer: 0.90, fall: 1.30, winter: 0.95 } },
    art: { tint: '#d7b454', shape: 'sack' },
  },
  {
    id: 'cheese-popcorn',
    name: 'CHEESE CORN',
    group: 'snack',
    category: 'artisan',
    level: 61,
    madeBy: 'popcorn-pot',
    econ: { base: 525, elasticity: 0.50, recovery: 0.28, seasonal: { spring: 0.95, summer: 0.90, fall: 1.30, winter: 0.95 } },
    art: { tint: '#c8d13d', shape: 'sack' },
  },
  {
    id: 'caramel-corn',
    name: 'CARAMEL CORN',
    group: 'snack',
    category: 'artisan',
    level: 72,
    madeBy: 'popcorn-pot',
    econ: { base: 305, elasticity: 0.50, recovery: 0.28, seasonal: { spring: 0.95, summer: 0.90, fall: 1.30, winter: 0.95 } },
    art: { tint: '#b79a3b', shape: 'sack' },
  },
  {
    id: 'grilled-corn',
    name: 'GRILL CORN',
    group: 'cooked',
    category: 'artisan',
    level: 58,
    madeBy: 'bbq-grill',
    econ: { base: 635, elasticity: 0.60, recovery: 0.20, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#dcb56d', shape: 'skewer' },
  },
  {
    id: 'roasted-squash',
    name: 'ROAST SQUASH',
    group: 'cooked',
    category: 'artisan',
    level: 58,
    madeBy: 'bbq-grill',
    econ: { base: 185, elasticity: 0.60, recovery: 0.20, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#d77254', shape: 'skewer' },
  },
  {
    id: 'grilled-fish',
    name: 'GRILL FISH',
    group: 'cooked',
    category: 'artisan',
    level: 58,
    madeBy: 'bbq-grill',
    econ: { base: 190, elasticity: 0.60, recovery: 0.20, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#d1763d', shape: 'skewer' },
  },
  {
    id: 'bacon-and-eggs',
    name: 'BACON N EGGS',
    group: 'cooked',
    category: 'artisan',
    level: 78,
    madeBy: 'bbq-grill',
    econ: { base: 245, elasticity: 0.60, recovery: 0.20, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#b7463b', shape: 'skewer' },
  },
  {
    id: 'skewer',
    name: 'SKEWER',
    group: 'cooked',
    category: 'artisan',
    level: 78,
    madeBy: 'bbq-grill',
    econ: { base: 235, elasticity: 0.60, recovery: 0.20, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#a24e34', shape: 'skewer' },
  },
  {
    id: 'roast',
    name: 'ROAST',
    group: 'cooked',
    category: 'artisan',
    level: 78,
    madeBy: 'bbq-grill',
    econ: { base: 710, elasticity: 0.60, recovery: 0.20, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#d29874', shape: 'skewer' },
  },
  {
    id: 'farm-breakfast',
    name: 'BIG BREAKFAST',
    group: 'cooked',
    category: 'artisan',
    level: 78,
    madeBy: 'bbq-grill',
    econ: { base: 890, elasticity: 0.60, recovery: 0.20, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#c0726b', shape: 'skewer' },
  },
  {
    id: 'burger',
    name: 'BURGER',
    group: 'cooked',
    category: 'artisan',
    level: 78,
    madeBy: 'bbq-grill',
    econ: { base: 1690, elasticity: 0.60, recovery: 0.20, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#b76e57', shape: 'skewer' },
  },
  {
    id: 'royal-banquet',
    name: 'ROYAL BANQUET',
    group: 'cooked',
    category: 'artisan',
    level: 98,
    madeBy: 'bbq-grill',
    econ: { base: 13630, elasticity: 0.60, recovery: 0.20, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#aa6e49', shape: 'skewer' },
  },
  {
    id: 'vegetable-stew',
    name: 'VEG STEW',
    group: 'cooked',
    category: 'artisan',
    level: 51,
    madeBy: 'soup-kitchen',
    econ: { base: 96, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#dc6a6c', shape: 'bowl' },
  },
  {
    id: 'pea-soup',
    name: 'PEA SOUP',
    group: 'cooked',
    category: 'artisan',
    level: 50,
    madeBy: 'soup-kitchen',
    econ: { base: 73, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#d76554', shape: 'bowl' },
  },
  {
    id: 'tomato-soup',
    name: 'TOMATO SOUP',
    group: 'cooked',
    category: 'artisan',
    level: 50,
    madeBy: 'soup-kitchen',
    econ: { base: 270, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#d1673d', shape: 'bowl' },
  },
  {
    id: 'pumpkin-soup',
    name: 'PUMPKIN SOUP',
    group: 'cooked',
    category: 'artisan',
    level: 51,
    madeBy: 'soup-kitchen',
    econ: { base: 375, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#b73b3d', shape: 'bowl' },
  },
  {
    id: 'mushroom-soup',
    name: 'MUSHRM SOUP',
    group: 'cooked',
    category: 'artisan',
    level: 52,
    madeBy: 'soup-kitchen',
    econ: { base: 305, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#a24334', shape: 'bowl' },
  },
  {
    id: 'egg-drop-soup',
    name: 'EGG DROP SOUP',
    group: 'cooked',
    category: 'artisan',
    level: 54,
    madeBy: 'soup-kitchen',
    econ: { base: 210, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#d28f74', shape: 'bowl' },
  },
  {
    id: 'chowder',
    name: 'CHOWDER',
    group: 'cooked',
    category: 'artisan',
    level: 56,
    madeBy: 'soup-kitchen',
    econ: { base: 195, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#c06b6c', shape: 'bowl' },
  },
  {
    id: 'fish-stew',
    name: 'FISH STEW',
    group: 'cooked',
    category: 'artisan',
    level: 58,
    madeBy: 'soup-kitchen',
    econ: { base: 205, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#b76457', shape: 'bowl' },
  },
  {
    id: 'bacon-stew',
    name: 'BACON STEW',
    group: 'cooked',
    category: 'artisan',
    level: 78,
    madeBy: 'soup-kitchen',
    econ: { base: 385, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#aa6449', shape: 'bowl' },
  },
  {
    id: 'harvest-feast',
    name: 'HARVEST FEAST',
    group: 'cooked',
    category: 'artisan',
    level: 94,
    madeBy: 'soup-kitchen',
    econ: { base: 1770, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#ae292b', shape: 'bowl' },
  },
  {
    id: 'garden-salad',
    name: 'GARDEN SALAD',
    group: 'cooked',
    category: 'artisan',
    level: 53,
    madeBy: 'salad-bar',
    econ: { base: 98, elasticity: 0.50, recovery: 0.25, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#a1dc6a', shape: 'bowl' },
  },
  {
    id: 'coleslaw',
    name: 'COLESLAW',
    group: 'cooked',
    category: 'artisan',
    level: 52,
    madeBy: 'salad-bar',
    econ: { base: 250, elasticity: 0.50, recovery: 0.25, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#7fd754', shape: 'bowl' },
  },
  {
    id: 'fruit-salad',
    name: 'FRUIT SALAD',
    group: 'cooked',
    category: 'artisan',
    level: 54,
    madeBy: 'salad-bar',
    econ: { base: 160, elasticity: 0.50, recovery: 0.25, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#58d13d', shape: 'bowl' },
  },
  {
    id: 'winter-salad',
    name: 'WINTER SALAD',
    group: 'cooked',
    category: 'artisan',
    level: 55,
    madeBy: 'salad-bar',
    econ: { base: 225, elasticity: 0.50, recovery: 0.25, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#77b73b', shape: 'bowl' },
  },
  {
    id: 'potato-salad',
    name: 'POTATO SALAD',
    group: 'cooked',
    category: 'artisan',
    level: 56,
    madeBy: 'salad-bar',
    econ: { base: 265, elasticity: 0.50, recovery: 0.25, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#59a234', shape: 'bowl' },
  },
  {
    id: 'caesar-salad',
    name: 'CAESAR SALAD',
    group: 'cooked',
    category: 'artisan',
    level: 60,
    madeBy: 'salad-bar',
    econ: { base: 705, elasticity: 0.50, recovery: 0.25, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#86d274', shape: 'bowl' },
  },
  {
    id: 'greek-salad',
    name: 'GREEK SALAD',
    group: 'cooked',
    category: 'artisan',
    level: 62,
    madeBy: 'salad-bar',
    econ: { base: 730, elasticity: 0.50, recovery: 0.25, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#94c06b', shape: 'bowl' },
  },
  {
    id: 'festival-platter',
    name: 'FEST PLATTER',
    group: 'cooked',
    category: 'artisan',
    level: 95,
    madeBy: 'salad-bar',
    econ: { base: 5620, elasticity: 0.50, recovery: 0.25, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#77b757', shape: 'bowl' },
  },
  {
    id: 'pasta-sauce',
    name: 'PASTA SAUCE',
    group: 'pantry',
    category: 'artisan',
    level: 54,
    madeBy: 'sauce-maker',
    econ: { base: 150, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.95, summer: 0.90, fall: 1.30, winter: 0.95 } },
    art: { tint: '#dc6a74', shape: 'jar' },
  },
  {
    id: 'salsa',
    name: 'SALSA',
    group: 'pantry',
    category: 'artisan',
    level: 54,
    madeBy: 'sauce-maker',
    econ: { base: 155, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.95, summer: 0.90, fall: 1.30, winter: 0.95 } },
    art: { tint: '#d75c54', shape: 'jar' },
  },
  {
    id: 'ketchup',
    name: 'KETCHUP',
    group: 'pantry',
    category: 'artisan',
    level: 59,
    madeBy: 'sauce-maker',
    econ: { base: 295, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.95, summer: 0.90, fall: 1.30, winter: 0.95 } },
    art: { tint: '#d15d3d', shape: 'jar' },
  },
  {
    id: 'chilli-oil',
    name: 'CHILLI OIL',
    group: 'pantry',
    category: 'artisan',
    level: 58,
    madeBy: 'sauce-maker',
    econ: { base: 135, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.95, summer: 0.90, fall: 1.30, winter: 0.95 } },
    art: { tint: '#b73b46', shape: 'jar' },
  },
  {
    id: 'hot-sauce',
    name: 'HOT SAUCE',
    group: 'pantry',
    category: 'artisan',
    level: 60,
    madeBy: 'sauce-maker',
    econ: { base: 275, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.95, summer: 0.90, fall: 1.30, winter: 0.95 } },
    art: { tint: '#a23c34', shape: 'jar' },
  },
  {
    id: 'pesto',
    name: 'PESTO',
    group: 'pantry',
    category: 'artisan',
    level: 64,
    madeBy: 'sauce-maker',
    econ: { base: 740, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.95, summer: 0.90, fall: 1.30, winter: 0.95 } },
    art: { tint: '#d28974', shape: 'jar' },
  },
  {
    id: 'pasta',
    name: 'PASTA',
    group: 'cooked',
    category: 'artisan',
    level: 57,
    madeBy: 'pasta-maker',
    econ: { base: 51, elasticity: 0.50, recovery: 0.22, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#dcad6a', shape: 'nest' },
  },
  {
    id: 'noodles',
    name: 'NOODLES',
    group: 'cooked',
    category: 'artisan',
    level: 56,
    madeBy: 'pasta-maker',
    econ: { base: 61, elasticity: 0.50, recovery: 0.22, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#d7b556', shape: 'nest' },
  },
  {
    id: 'egg-noodle',
    name: 'EGG NOODLE',
    group: 'cooked',
    category: 'artisan',
    level: 72,
    madeBy: 'pasta-maker',
    econ: { base: 100, elasticity: 0.50, recovery: 0.22, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#d1c03d', shape: 'nest' },
  },
  {
    id: 'mac-and-cheese',
    name: 'MAC N CHEESE',
    group: 'cooked',
    category: 'artisan',
    level: 64,
    madeBy: 'pasta-maker',
    econ: { base: 1180, elasticity: 0.50, recovery: 0.22, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#b7833b', shape: 'nest' },
  },
  {
    id: 'ravioli',
    name: 'RAVIOLI',
    group: 'cooked',
    category: 'artisan',
    level: 66,
    madeBy: 'pasta-maker',
    econ: { base: 585, elasticity: 0.50, recovery: 0.22, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#a28534', shape: 'nest' },
  },
  {
    id: 'lasagne',
    name: 'LASAGNE',
    group: 'cooked',
    category: 'artisan',
    level: 68,
    madeBy: 'pasta-maker',
    econ: { base: 750, elasticity: 0.50, recovery: 0.22, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#d2c774', shape: 'nest' },
  },
  {
    id: 'ramen',
    name: 'RAMEN',
    group: 'cooked',
    category: 'artisan',
    level: 78,
    madeBy: 'pasta-maker',
    econ: { base: 300, elasticity: 0.50, recovery: 0.22, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#c09c6b', shape: 'nest' },
  },
  {
    id: 'truffle-pasta',
    name: 'TRUFFLE PASTA',
    group: 'cooked',
    category: 'artisan',
    level: 78,
    madeBy: 'pasta-maker',
    econ: { base: 810, elasticity: 0.50, recovery: 0.22, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#b79e57', shape: 'nest' },
  },
  {
    id: 'candle',
    name: 'CANDLE',
    group: 'craft',
    category: 'artisan',
    level: 74,
    madeBy: 'candle-maker',
    econ: { base: 495, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#dca16a', shape: 'candle' },
  },
  {
    id: 'lantern',
    name: 'LANTERN',
    group: 'craft',
    category: 'artisan',
    level: 74,
    madeBy: 'candle-maker',
    econ: { base: 950, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#d7a754', shape: 'candle' },
  },
  {
    id: 'wax-polish',
    name: 'WAX POLISH',
    group: 'craft',
    category: 'artisan',
    level: 74,
    madeBy: 'candle-maker',
    econ: { base: 395, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#d1b13d', shape: 'candle' },
  },
  {
    id: 'scented-candle',
    name: 'SCENT CANDLE',
    group: 'craft',
    category: 'artisan',
    level: 80,
    madeBy: 'candle-maker',
    econ: { base: 570, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#b7773b', shape: 'candle' },
  },
  {
    id: 'lye',
    name: 'LYE',
    group: 'craft',
    category: 'artisan',
    level: 71,
    madeBy: 'soap-maker',
    econ: { base: 23, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#6adca5', shape: 'cake' },
  },
  {
    id: 'soap',
    name: 'SOAP',
    group: 'craft',
    category: 'artisan',
    level: 71,
    madeBy: 'soap-maker',
    econ: { base: 320, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#54d7ab', shape: 'cake' },
  },
  {
    id: 'honey-soap',
    name: 'HONEY SOAP',
    group: 'craft',
    category: 'artisan',
    level: 71,
    madeBy: 'soap-maker',
    econ: { base: 555, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#3dd1b6', shape: 'cake' },
  },
  {
    id: 'lotion',
    name: 'LOTION',
    group: 'craft',
    category: 'artisan',
    level: 71,
    madeBy: 'soap-maker',
    econ: { base: 515, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#3bb77b', shape: 'cake' },
  },
  {
    id: 'flower-soap',
    name: 'FLOWER SOAP',
    group: 'craft',
    category: 'artisan',
    level: 80,
    madeBy: 'soap-maker',
    econ: { base: 375, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#34a27d', shape: 'cake' },
  },
  {
    id: 'luxury-soap',
    name: 'LUXURY SOAP',
    group: 'craft',
    category: 'artisan',
    level: 89,
    madeBy: 'soap-maker',
    econ: { base: 1120, elasticity: 0.60, recovery: 0.18, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#74d2c1', shape: 'cake' },
  },
  {
    id: 'sauerkraut',
    name: 'SAUERKRAUT',
    group: 'preserve',
    category: 'artisan',
    level: 18,
    madeBy: 'preserves-jar',
    econ: { base: 275, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.85, summer: 0.90, fall: 1.15, winter: 1.20 } },
    art: { tint: '#b4dc6a', shape: 'jar' },
  },
  {
    id: 'pickled-radish',
    name: 'PICKLED RAD',
    group: 'preserve',
    category: 'artisan',
    level: 19,
    madeBy: 'preserves-jar',
    econ: { base: 110, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.85, summer: 0.90, fall: 1.15, winter: 1.20 } },
    art: { tint: '#95d754', shape: 'jar' },
  },
  {
    id: 'pickles',
    name: 'PICKLES',
    group: 'preserve',
    category: 'artisan',
    level: 20,
    madeBy: 'preserves-jar',
    econ: { base: 95, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.85, summer: 0.90, fall: 1.15, winter: 1.20 } },
    art: { tint: '#71d13d', shape: 'jar' },
  },
  {
    id: 'pickled-peppers',
    name: 'PICKLED PEP',
    group: 'preserve',
    category: 'artisan',
    level: 21,
    madeBy: 'preserves-jar',
    econ: { base: 125, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.85, summer: 0.90, fall: 1.15, winter: 1.20 } },
    art: { tint: '#8cb73b', shape: 'jar' },
  },
  {
    id: 'preserved-lemon',
    name: 'PRESRV LEMON',
    group: 'preserve',
    category: 'artisan',
    level: 31,
    madeBy: 'preserves-jar',
    econ: { base: 115, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.85, summer: 0.90, fall: 1.15, winter: 1.20 } },
    art: { tint: '#6ba234', shape: 'jar' },
  },
  {
    id: 'cured-olive',
    name: 'CURED OLIVE',
    group: 'preserve',
    category: 'artisan',
    level: 38,
    madeBy: 'preserves-jar',
    econ: { base: 120, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.85, summer: 0.90, fall: 1.15, winter: 1.20 } },
    art: { tint: '#95d274', shape: 'jar' },
  },
  {
    id: 'caviar',
    name: 'CAVIAR',
    group: 'preserve',
    category: 'artisan',
    level: 72,
    madeBy: 'preserves-jar',
    econ: { base: 505, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.85, summer: 0.90, fall: 1.15, winter: 1.20 } },
    art: { tint: '#a2c06b', shape: 'jar' },
  },
  {
    id: 'golden-preserve',
    name: 'GOLD PRESERVE',
    group: 'preserve',
    category: 'artisan',
    level: 99,
    madeBy: 'preserves-jar',
    econ: { base: 3850, elasticity: 0.55, recovery: 0.20, seasonal: { spring: 0.85, summer: 0.90, fall: 1.15, winter: 1.20 } },
    art: { tint: '#87b757', shape: 'jar' },
  },
  {
    id: 'ice-cream',
    name: 'ICE CREAM',
    group: 'sweet',
    category: 'artisan',
    level: 66,
    madeBy: 'ice-cream-maker',
    econ: { base: 485, elasticity: 0.80, recovery: 0.16, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#6adadc', shape: 'cone' },
  },
  {
    id: 'lemon-sorbet',
    name: 'LEMON SORBET',
    group: 'sweet',
    category: 'artisan',
    level: 67,
    madeBy: 'ice-cream-maker',
    econ: { base: 240, elasticity: 0.80, recovery: 0.16, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#d7ca54', shape: 'cone' },
  },
  {
    id: 'milkshake',
    name: 'MILKSHAKE',
    group: 'sweet',
    category: 'artisan',
    level: 69,
    madeBy: 'ice-cream-maker',
    econ: { base: 590, elasticity: 0.80, recovery: 0.16, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#d2b73f', shape: 'cone' },
  },
  {
    id: 'mango-sorbet',
    name: 'MANGO SORBET',
    group: 'sweet',
    category: 'artisan',
    level: 72,
    madeBy: 'ice-cream-maker',
    econ: { base: 310, elasticity: 0.80, recovery: 0.16, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#b76f3b', shape: 'cone' },
  },
  {
    id: 'strawberry-ice-cream',
    name: 'STRAWB SCOOP',
    group: 'sweet',
    category: 'artisan',
    level: 74,
    madeBy: 'ice-cream-maker',
    econ: { base: 570, elasticity: 0.80, recovery: 0.16, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#a2344a', shape: 'cone' },
  },
  {
    id: 'chocolate-ice-cream',
    name: 'CHOC SCOOP',
    group: 'sweet',
    category: 'artisan',
    level: 80,
    madeBy: 'ice-cream-maker',
    econ: { base: 1070, elasticity: 0.80, recovery: 0.16, seasonal: { spring: 0.95, summer: 1.30, fall: 1.00, winter: 0.80 } },
    art: { tint: '#d2a574', shape: 'cone' },
  },
  {
    id: 'caramel',
    name: 'CARAMEL',
    group: 'sweet',
    category: 'artisan',
    level: 68,
    madeBy: 'candy-machine',
    econ: { base: 300, elasticity: 0.75, recovery: 0.16, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#dc6ada', shape: 'candy' },
  },
  {
    id: 'toffee',
    name: 'TOFFEE',
    group: 'sweet',
    category: 'artisan',
    level: 69,
    madeBy: 'candy-machine',
    econ: { base: 740, elasticity: 0.75, recovery: 0.16, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#d754c1', shape: 'candy' },
  },
  {
    id: 'candy',
    name: 'CANDY',
    group: 'sweet',
    category: 'artisan',
    level: 70,
    madeBy: 'candy-machine',
    econ: { base: 175, elasticity: 0.75, recovery: 0.16, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#d13da2', shape: 'candy' },
  },
  {
    id: 'lollipop',
    name: 'LOLLIPOP',
    group: 'sweet',
    category: 'artisan',
    level: 71,
    madeBy: 'candy-machine',
    econ: { base: 270, elasticity: 0.75, recovery: 0.16, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#b73bb5', shape: 'candy' },
  },
  {
    id: 'gummies',
    name: 'GUMMIES',
    group: 'sweet',
    category: 'artisan',
    level: 74,
    madeBy: 'candy-machine',
    econ: { base: 135, elasticity: 0.75, recovery: 0.16, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#a23490', shape: 'candy' },
  },
  {
    id: 'nougat',
    name: 'NOUGAT',
    group: 'sweet',
    category: 'artisan',
    level: 76,
    madeBy: 'candy-machine',
    econ: { base: 430, elasticity: 0.75, recovery: 0.16, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#d274b4', shape: 'candy' },
  },
  {
    id: 'fudge',
    name: 'FUDGE',
    group: 'sweet',
    category: 'artisan',
    level: 84,
    madeBy: 'candy-machine',
    econ: { base: 1050, elasticity: 0.75, recovery: 0.16, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#c06bbe', shape: 'candy' },
  },
  {
    id: 'candied-citrus',
    name: 'CAND CITRUS',
    group: 'sweet',
    category: 'artisan',
    level: 97,
    madeBy: 'candy-machine',
    econ: { base: 760, elasticity: 0.75, recovery: 0.16, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#b757a7', shape: 'candy' },
  },
  {
    id: 'black-coffee',
    name: 'COFFEE',
    group: 'drink',
    category: 'artisan',
    level: 79,
    madeBy: 'coffee-kiosk',
    econ: { base: 120, elasticity: 0.80, recovery: 0.16, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#dc876a', shape: 'cup' },
  },
  {
    id: 'espresso',
    name: 'ESPRESSO',
    group: 'drink',
    category: 'artisan',
    level: 79,
    madeBy: 'coffee-kiosk',
    econ: { base: 180, elasticity: 0.80, recovery: 0.16, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#d78854', shape: 'cup' },
  },
  {
    id: 'latte',
    name: 'LATTE',
    group: 'drink',
    category: 'artisan',
    level: 79,
    madeBy: 'coffee-kiosk',
    econ: { base: 520, elasticity: 0.80, recovery: 0.16, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#d18f3d', shape: 'cup' },
  },
  {
    id: 'cappuccino',
    name: 'CAPPUCCINO',
    group: 'drink',
    category: 'artisan',
    level: 79,
    madeBy: 'coffee-kiosk',
    econ: { base: 645, elasticity: 0.80, recovery: 0.16, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#b75a3b', shape: 'cup' },
  },
  {
    id: 'cold-brew',
    name: 'COLD BREW',
    group: 'drink',
    category: 'artisan',
    level: 79,
    madeBy: 'coffee-kiosk',
    econ: { base: 250, elasticity: 0.80, recovery: 0.16, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#a36135', shape: 'cup' },
  },
  {
    id: 'mocha',
    name: 'MOCHA',
    group: 'drink',
    category: 'artisan',
    level: 82,
    madeBy: 'coffee-kiosk',
    econ: { base: 1560, elasticity: 0.80, recovery: 0.16, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#d2a874', shape: 'cup' },
  },
  {
    id: 'chocolate',
    name: 'CHOCOLATE',
    group: 'sweet',
    category: 'artisan',
    level: 76,
    madeBy: 'chocolate-works',
    econ: { base: 620, elasticity: 0.85, recovery: 0.14, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#dc7b6a', shape: 'bar' },
  },
  {
    id: 'cocoa',
    name: 'COCOA',
    group: 'sweet',
    category: 'artisan',
    level: 76,
    madeBy: 'chocolate-works',
    econ: { base: 215, elasticity: 0.85, recovery: 0.14, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#d77b54', shape: 'bar' },
  },
  {
    id: 'chocolate-truffle',
    name: 'TRUFFLE CHOC',
    group: 'sweet',
    category: 'artisan',
    level: 77,
    madeBy: 'chocolate-works',
    econ: { base: 700, elasticity: 0.85, recovery: 0.14, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#d1803d', shape: 'bar' },
  },
  {
    id: 'hot-chocolate',
    name: 'HOT CHOC',
    group: 'sweet',
    category: 'artisan',
    level: 78,
    madeBy: 'chocolate-works',
    econ: { base: 430, elasticity: 0.85, recovery: 0.14, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#b74e3b', shape: 'bar' },
  },
  {
    id: 'chocolate-bar',
    name: 'CHOC BAR',
    group: 'sweet',
    category: 'artisan',
    level: 80,
    madeBy: 'chocolate-works',
    econ: { base: 685, elasticity: 0.85, recovery: 0.14, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#a25534', shape: 'bar' },
  },
  {
    id: 'white-chocolate',
    name: 'WHITE CHOC',
    group: 'sweet',
    category: 'artisan',
    level: 84,
    madeBy: 'chocolate-works',
    econ: { base: 435, elasticity: 0.85, recovery: 0.14, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#d2ca74', shape: 'bar' },
  },
  {
    id: 'praline',
    name: 'PRALINE',
    group: 'sweet',
    category: 'artisan',
    level: 88,
    madeBy: 'chocolate-works',
    econ: { base: 895, elasticity: 0.85, recovery: 0.14, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#c0786b', shape: 'bar' },
  },
  {
    id: 'truffle-bar',
    name: 'TRUFFLE BAR',
    group: 'sweet',
    category: 'artisan',
    level: 86,
    madeBy: 'chocolate-works',
    econ: { base: 1930, elasticity: 0.85, recovery: 0.14, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#b77457', shape: 'bar' },
  },
  {
    id: 'spiced-chocolate',
    name: 'SPICED CHOC',
    group: 'sweet',
    category: 'artisan',
    level: 91,
    madeBy: 'chocolate-works',
    econ: { base: 905, elasticity: 0.85, recovery: 0.14, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#aa7449', shape: 'bar' },
  },
  {
    id: 'flower-tea',
    name: 'FLOWER TEA',
    group: 'drink',
    category: 'artisan',
    level: 80,
    madeBy: 'tea-house',
    econ: { base: 87, elasticity: 0.75, recovery: 0.18, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#6adc6c', shape: 'cup' },
  },
  {
    id: 'berry-infusion',
    name: 'BERRY BREW',
    group: 'drink',
    category: 'artisan',
    level: 80,
    madeBy: 'tea-house',
    econ: { base: 67, elasticity: 0.75, recovery: 0.18, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#d75477', shape: 'cup' },
  },
  {
    id: 'lemon-tea',
    name: 'LEMON TEA',
    group: 'drink',
    category: 'artisan',
    level: 80,
    madeBy: 'tea-house',
    econ: { base: 320, elasticity: 0.75, recovery: 0.18, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#cad13d', shape: 'cup' },
  },
  {
    id: 'iced-tea',
    name: 'ICED TEA',
    group: 'drink',
    category: 'artisan',
    level: 80,
    madeBy: 'tea-house',
    econ: { base: 240, elasticity: 0.75, recovery: 0.18, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#b97c3c', shape: 'cup' },
  },
  {
    id: 'chai-tea',
    name: 'CHAI TEA',
    group: 'drink',
    category: 'artisan',
    level: 84,
    madeBy: 'tea-house',
    econ: { base: 315, elasticity: 0.75, recovery: 0.18, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#34a247', shape: 'cup' },
  },
  {
    id: 'copper-bar',
    name: 'COPPER BAR',
    group: 'metal',
    category: 'mineral',
    level: 70,
    madeBy: 'smelter',
    econ: { base: 230, elasticity: 0.70, recovery: 0.18, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#dc896d', shape: 'ingot' },
  },
  {
    id: 'iron-bar',
    name: 'IRON BAR',
    group: 'metal',
    category: 'mineral',
    level: 72,
    madeBy: 'smelter',
    econ: { base: 335, elasticity: 0.70, recovery: 0.18, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#5495d7', shape: 'ingot' },
  },
  {
    id: 'glass',
    name: 'GLASS',
    group: 'metal',
    category: 'mineral',
    level: 71,
    madeBy: 'smelter',
    econ: { base: 45, elasticity: 0.70, recovery: 0.18, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#3dacd1', shape: 'ingot' },
  },
  {
    id: 'gold-bar',
    name: 'GOLD BAR',
    group: 'metal',
    category: 'mineral',
    level: 76,
    madeBy: 'smelter',
    econ: { base: 730, elasticity: 0.70, recovery: 0.18, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#b7883b', shape: 'ingot' },
  },
  {
    id: 'steel-bar',
    name: 'STEEL BAR',
    group: 'metal',
    category: 'mineral',
    level: 82,
    madeBy: 'smelter',
    econ: { base: 1360, elasticity: 0.70, recovery: 0.18, seasonal: { spring: 1.00, summer: 1.00, fall: 1.00, winter: 1.00 } },
    art: { tint: '#346ba2', shape: 'ingot' },
  },
  {
    id: 'wine',
    name: 'WINE',
    group: 'drink',
    category: 'artisan',
    level: 88,
    madeBy: 'keg',
    econ: { base: 430, elasticity: 0.95, recovery: 0.12, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#a56adc', shape: 'bottle' },
  },
  {
    id: 'cider',
    name: 'CIDER',
    group: 'drink',
    category: 'artisan',
    level: 88,
    madeBy: 'keg',
    econ: { base: 605, elasticity: 0.95, recovery: 0.12, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#d7a856', shape: 'bottle' },
  },
  {
    id: 'plum-wine',
    name: 'PLUM WINE',
    group: 'drink',
    category: 'artisan',
    level: 88,
    madeBy: 'keg',
    econ: { base: 520, elasticity: 0.95, recovery: 0.12, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#b63dd1', shape: 'bottle' },
  },
  {
    id: 'mead',
    name: 'MEAD',
    group: 'drink',
    category: 'artisan',
    level: 90,
    madeBy: 'keg',
    econ: { base: 1980, elasticity: 0.95, recovery: 0.12, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#b9853c', shape: 'bottle' },
  },
  {
    id: 'ale',
    name: 'ALE',
    group: 'drink',
    category: 'artisan',
    level: 92,
    madeBy: 'keg',
    econ: { base: 355, elasticity: 0.95, recovery: 0.12, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#a27d34', shape: 'bottle' },
  },
  {
    id: 'vinegar',
    name: 'VINEGAR',
    group: 'drink',
    category: 'artisan',
    level: 94,
    madeBy: 'keg',
    econ: { base: 695, elasticity: 0.95, recovery: 0.12, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#cad274', shape: 'bottle' },
  },
  {
    id: 'vintage-wine',
    name: 'VINTAGE WINE',
    group: 'drink',
    category: 'artisan',
    level: 93,
    madeBy: 'keg',
    econ: { base: 1100, elasticity: 0.95, recovery: 0.12, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#976bc0', shape: 'bottle' },
  },
  {
    id: 'reserve-wine',
    name: 'RESERVE WINE',
    group: 'drink',
    category: 'artisan',
    level: 100,
    madeBy: 'keg',
    econ: { base: 5030, elasticity: 0.95, recovery: 0.12, seasonal: { spring: 0.90, summer: 0.80, fall: 1.05, winter: 1.30 } },
    art: { tint: '#9757b7', shape: 'bottle' },
  },
]

/**
 * What every crop and tree fruit was worth when the prices below were computed.
 *
 * It is not the live price — `referenceValue()` reads `crops.ts` and `trees.ts` for
 * that. It is the audit trail, and the reason `validateEconomics()` can tell you that a
 * chain went thin because somebody repriced sugarcane rather than because the chain was
 * wrong. Every entry matched its table exactly at the moment this file was written.
 */
export const RAW_CROP_VALUE: Readonly<Record<string, number>> = {
  parsnip: 35,
  tulip: 44,
  cabbage: 78,
  strawberry: 52,
  pepper: 36,
  tomato: 38,
  corn: 5,
  melon: 280,
  barley: 16,
  beet: 48,
  grape: 36,
  pumpkin: 235,
  snowdrop: 52,
  winterroot: 62,
  frostcap: 78,
  wheat: 6,
  carrot: 16,
  potato: 20,
  lettuce: 30,
  radish: 32,
  onion: 42,
  peas: 14,
  cucumber: 24,
  chilli: 32,
  sugarcane: 12,
  cotton: 30,
  soybean: 15,
  squash: 80,
  garlic: 34,
  spinach: 22,
  rice: 20,
  indigo: 90,
  snowcabbage: 165,
  apple: 58,
  cherry: 40,
  peach: 88,
  orange: 78,
  lemon: 44,
  plum: 46,
  olive: 34,
  coconut: 95,
  banana: 66,
  mango: 105,
  cacao: 88,
  coffee: 74,
  blackberry: 26,
  raspberry: 22,
}

/**
 * Shadow value of a material. Materials are never bought or sold — `docs/CATALOG.md` §6
 * — but a recipe that eats four wood still has to price it or the margin is a lie.
 */
export const MATERIAL_VALUE: Readonly<Record<MaterialId, number>> = {
  wood: 6,
  stone: 5,
  fibre: 4,
  plank: 24,
  bolt: 18,
  screw: 15,
  nail: 12,
  tape: 30,
  deed: 2500,
  mallet: 220,
  axe: 240,
  saw: 260,
}

/**
 * Products the storage layer should bank as a material rather than as a good. The sawmill
 * makes planks and planks are a `MaterialId`; this is the one place the two meet.
 */
export const MATERIAL_PRODUCTS: Readonly<Record<string, MaterialId>> = {
  plank: 'plank',
}

/**
 * The chains `docs/CATALOG.md` §5 requires, plus the ones this table adds. Value per unit
 * of raw input must rise at every step of every one of them, which is what stops a chain
 * from being decoration.
 */
export const REQUIRED_CHAINS: ReadonlyArray<readonly string[]> = [
  ['wheat', 'flour', 'bread', 'sandwich'],
  ['milk', 'cream', 'butter', 'cake'],
  ['wool', 'cloth', 'clothing'],
  ['sugarcane', 'syrup', 'sugar', 'candy'],
  ['cacao', 'chocolate', 'chocolate-truffle'],
  ['olive', 'olive-oil', 'soap'],
  ['barley', 'malt', 'ale'],
  ['honeycomb', 'honey', 'mead'],
  ['coffee', 'espresso', 'latte'],
  ['cotton', 'cotton-cloth', 'lace'],
  ['iron-ore', 'iron-bar', 'steel-bar'],
  ['sugarcane', 'syrup', 'molasses', 'brown-sugar'],
  ['cacao', 'cocoa', 'hot-chocolate'],
]

/** A recipe must return at least this multiple of what it consumes. */
export const MIN_RECIPE_MARGIN = 1.2

const BY_ID: ReadonlyMap<string, ProductDef> = new Map(PRODUCTS.map((p) => [p.id, p]))

function indexRecipes(): { made: Map<string, Recipe[]>; used: Map<string, Recipe[]> } {
  const made = new Map<string, Recipe[]>()
  const used = new Map<string, Recipe[]>()
  for (const recipe of allRecipes()) {
    const out = made.get(recipe.outputProductId)
    if (out) out.push(recipe)
    else made.set(recipe.outputProductId, [recipe])
    for (const input of recipe.inputs) {
      if (input.item.kind !== 'product') continue
      const list = used.get(input.item.productId)
      if (list) list.push(recipe)
      else used.set(input.item.productId, [recipe])
    }
  }
  return { made, used }
}

const RECIPE_INDEX = indexRecipes()

export function productById(id: string): ProductDef | undefined {
  return BY_ID.get(id)
}

/** Throws if the id is unknown. Use where a missing product is a programming error. */
export function requireProduct(id: string): ProductDef {
  const product = BY_ID.get(id)
  if (!product) throw new Error(`requireProduct: unknown product "${id}"`)
  return product
}

/** Every recipe that produces this product. Empty for a raw animal or mine good. */
export function recipesFor(productId: string): Recipe[] {
  return RECIPE_INDEX.made.get(productId) ?? []
}

/** Every recipe that consumes this product. The other half of the Almanac's chain tree. */
export function recipesUsing(productId: string): Recipe[] {
  return RECIPE_INDEX.used.get(productId) ?? []
}

/** Goods this machine can make. */
export function productsByMachine(kind: MachineKind): ProductDef[] {
  return PRODUCTS.filter((p) => p.madeBy === kind)
}

/** Goods the player could be holding at this level, cheapest first. */
export function productsForLevel(level: number): ProductDef[] {
  return PRODUCTS.filter((p) => p.level <= level).sort((a, b) => a.econ.base - b.econ.base)
}

/** Sale value of one unit at a quality, before every market multiplier. Rounded down,
 *  exactly as `produceValue` does it for crops. */
export function productValue(product: ProductDef, quality: Quality): number {
  return Math.floor(product.econ.base * QUALITY_MULTIPLIER[quality])
}

/**
 * How deep in a production chain this good sits, counting itself and the raw thing at the
 * bottom. Milk is 1, cream 2, butter 3, cake 4 — so `docs/CATALOG.md`'s
 * `milk -> cream -> butter -> cake` reads as depth 4, and an id that is not a product at
 * all (a crop, a material) counts as 1, being raw by definition.
 */
export function chainDepth(productId: string): number {
  return depthOf(productId, new Set())
}

function depthOf(productId: string, seen: Set<string>): number {
  if (seen.has(productId)) return 1
  const recipes = RECIPE_INDEX.made.get(productId)
  if (!recipes || recipes.length === 0) return 1
  seen.add(productId)
  let deepest = 1
  for (const recipe of recipes) {
    for (const input of recipe.inputs) {
      const below = input.item.kind === 'product' ? depthOf(input.item.productId, seen) : 1
      if (below + 1 > deepest) deepest = below + 1
    }
  }
  seen.delete(productId)
  return deepest
}

/**
 * How many raw items — crops, materials, animal produce, ore — one unit of this good
 * costs, all the way down. Fractional, because three wheat make two flour.
 */
export function rawInputUnits(productId: string): number {
  return unitsOf(productId, new Set())
}

function unitsOf(productId: string, seen: Set<string>): number {
  if (seen.has(productId)) return 1
  const recipes = RECIPE_INDEX.made.get(productId)
  const recipe = recipes?.[0]
  if (!recipe) return 1
  seen.add(productId)
  let sum = 0
  for (const input of recipe.inputs) {
    const each = input.item.kind === 'product' ? unitsOf(input.item.productId, seen) : 1
    sum += each * input.count
  }
  seen.delete(productId)
  return sum / recipe.outputCount
}

/**
 * Gold this good is worth per raw *item* it consumed. Informational only: it counts one
 * 6 g wheat and one 340 g wool as the same single item, which is exactly why the rule
 * below is enforced on gold instead. Useful in the Almanac, not as a law.
 */
export function valuePerRawUnit(id: string): number {
  const product = BY_ID.get(id)
  if (!product) return leafValue(id)
  return product.econ.base / rawInputUnits(id)
}

/** What a crop, tree fruit or animal good is worth, by id, live from whichever table
 *  owns it. `RAW_CROP_VALUE` is the fallback and the record of what was balanced. */
function leafValue(id: string): number {
  const product = BY_ID.get(id)
  if (product) return product.econ.base
  return cropById(id)?.basePrice ?? treeById(id)?.basePrice ?? RAW_CROP_VALUE[id] ?? 0
}

/**
 * Gold of raw crop, tree fruit, material and animal produce burnt to make one unit of
 * this good, all the way down the chain.
 */
export function rawInputCost(id: string): number {
  return rawCostOf(id, new Set())
}

function rawCostOf(id: string, seen: Set<string>): number {
  if (seen.has(id)) return 0
  const recipe = RECIPE_INDEX.made.get(id)?.[0]
  if (!recipe) return leafValue(id)
  seen.add(id)
  let sum = 0
  for (const input of recipe.inputs) {
    const each =
      input.item.kind === 'product' ? rawCostOf(input.item.productId, seen) : referenceValue(input.item)
    sum += each * input.count
  }
  seen.delete(id)
  return sum / recipe.outputCount
}

/**
 * What this good returns per gold of raw input it consumed — 1.00 for anything raw,
 * 1.89 for flour, 4.77 for a cake. **This is the catalogue's rule made arithmetic**: a
 * deeper chain has to return more than a shallower one, and every single recipe has to
 * return more than the ingredient it is mostly made of. `validateEconomics()` proves
 * both, for all 195 recipes and every chain in `REQUIRED_CHAINS`.
 */
export function chainYield(id: string): number {
  const cost = rawInputCost(id)
  if (cost <= 0) return 1
  return leafValue(id) / cost
}

/** What one recipe input is worth, whatever kind of thing it is. */
export function referenceValue(item: ItemRef): number {
  switch (item.kind) {
    case 'product': return BY_ID.get(item.productId)?.econ.base ?? 0
    case 'produce': return cropById(item.cropId)?.basePrice ?? treeById(item.cropId)?.basePrice ?? RAW_CROP_VALUE[item.cropId] ?? 0
    case 'material': return MATERIAL_VALUE[item.materialId]
    case 'seed': return cropById(item.cropId)?.seedCost ?? treeById(item.cropId)?.seedCost ?? 0
    case 'good': return 0
  }
}

/** The ingredient a recipe is mostly made of, by gold. */
export function dominantInput(recipe: Recipe): ItemRef | null {
  let best: ItemRef | null = null
  let bestValue = -1
  for (const input of recipe.inputs) {
    const value = referenceValue(input.item) * input.count
    if (value > bestValue) {
      bestValue = value
      best = input.item
    }
  }
  return best
}

/** What one run of a recipe consumes, in gold. */
export function recipeInputCost(recipe: Recipe): number {
  let sum = 0
  for (const input of recipe.inputs) sum += referenceValue(input.item) * input.count
  return sum
}

/** What one run of a recipe produces, in gold. */
export function recipeOutputValue(recipe: Recipe): number {
  return (BY_ID.get(recipe.outputProductId)?.econ.base ?? 0) * recipe.outputCount
}

export type IssueSeverity = 'error' | 'warning'

export interface EconomyIssue {
  code:
    | 'unpriced'
    | 'thin-margin'
    | 'weak-step'
    | 'flat-chain'
    | 'unknown-chain-step'
    | 'orphan-product'
    | 'unmade-product'
    | 'duplicate-tint'
    | 'level-below-machine'
    | 'ingredient-unreachable'
    | 'crop-price-drift'
  severity: IssueSeverity
  /** Product id, recipe id or chain, whichever the issue is about. */
  subject: string
  detail: string
}

export interface EconomyReport {
  ok: boolean
  issues: EconomyIssue[]
  errors: EconomyIssue[]
  warnings: EconomyIssue[]
  checked: { products: number; recipes: number; chains: number; machines: number }
}

/**
 * Proves the whole catalogue is worth running, and is meant to be called from a test.
 *
 * Errors, any one of which means a chain is decoration:
 *  - a product with no price, or a recipe returning less than `MIN_RECIPE_MARGIN` of the
 *    gold it eats;
 *  - a recipe whose output returns *less per gold of raw input* than the ingredient it is
 *    mostly made of — that is a machine the player is right to ignore;
 *  - a step of a required chain that does not beat the step before it on the same measure;
 *  - a manufactured product nothing produces, two products an icon cannot tell apart, or a
 *    recipe unlocking before the machine that runs it or before its own ingredients exist.
 *
 * Warnings do not fail the build: a good that is neither an ingredient nor deep in a chain
 * is fine if it is a luxury sold raw, and a crop price that has drifted from
 * `RAW_CROP_VALUE` only means the two tables want reconciling.
 */
export function validateEconomics(): EconomyReport {
  const issues: EconomyIssue[] = []
  const add = (code: EconomyIssue['code'], severity: IssueSeverity, subject: string, detail: string) =>
    issues.push({ code, severity, subject, detail })

  for (const product of PRODUCTS) {
    if (product.econ.base < 1) add('unpriced', 'error', product.id, 'base price is below 1 g')
    if (product.madeBy !== null && recipesFor(product.id).length === 0) {
      add('unmade-product', 'error', product.id, `claims to come from ${product.madeBy} but no recipe makes it`)
    }
    if (product.madeBy === null && recipesUsing(product.id).length === 0 && product.econ.base < 200) {
      add('orphan-product', 'warning', product.id, 'raw good that feeds no chain and is not a luxury')
    }
  }

  const tints = new Map<string, string>()
  for (const product of PRODUCTS) {
    const owner = tints.get(product.art.tint)
    if (owner) add('duplicate-tint', 'error', product.id, `shares tint ${product.art.tint} with ${owner}`)
    else tints.set(product.art.tint, product.id)
  }

  let recipeCount = 0
  for (const machine of MACHINES) {
    for (const recipe of machine.recipes) {
      recipeCount++
      if (recipe.level < machine.level) {
        add('level-below-machine', 'error', recipe.id, `unlocks at ${recipe.level} but ${machine.kind} needs ${machine.level}`)
      }
      const cost = recipeInputCost(recipe)
      const value = recipeOutputValue(recipe)
      if (cost > 0 && value < cost * MIN_RECIPE_MARGIN) {
        add('thin-margin', 'error', recipe.id, `returns ${value} g for ${cost} g of inputs (${(value / cost).toFixed(2)}x)`)
      }
      const main = dominantInput(recipe)
      if (main) {
        const mainId = main.kind === 'product' ? main.productId : main.kind === 'produce' ? main.cropId : null
        const before = mainId === null ? 1 : chainYield(mainId)
        const after = chainYield(recipe.outputProductId)
        if (after <= before) {
          add('weak-step', 'error', recipe.id, `returns ${after.toFixed(2)}x its raw cost; its main ingredient already returns ${before.toFixed(2)}x`)
        }
      }
      for (const input of recipe.inputs) {
        if (input.item.kind !== 'product') continue
        const source = BY_ID.get(input.item.productId)
        if (source && source.level > recipe.level) {
          add('ingredient-unreachable', 'error', recipe.id, `unlocks at ${recipe.level} but needs ${source.id}, which arrives at ${source.level}`)
        }
      }
    }
  }

  for (const chain of REQUIRED_CHAINS) {
    let previous: number | null = null
    for (const step of chain) {
      if (!BY_ID.has(step) && !(step in RAW_CROP_VALUE)) {
        add('unknown-chain-step', 'error', chain.join(' > '), `"${step}" is neither a product nor a crop`)
        previous = null
        continue
      }
      const here = chainYield(step)
      if (previous !== null && here <= previous) {
        add('flat-chain', 'error', chain.join(' > '), `"${step}" returns ${here.toFixed(2)}x its raw cost, the step before returned ${previous.toFixed(2)}x`)
      }
      previous = here
    }
  }

  for (const [cropId, value] of Object.entries(RAW_CROP_VALUE)) {
    const grown = cropById(cropId) ?? treeById(cropId)
    if (!grown) continue
    const drift = Math.abs(grown.basePrice - value) / value
    if (drift > 0.25) {
      add('crop-price-drift', 'warning', cropId, `the crop table says ${grown.basePrice} g, this one was balanced at ${value} g`)
    }
  }

  const errors = issues.filter((i) => i.severity === 'error')
  return {
    ok: errors.length === 0,
    issues,
    errors,
    warnings: issues.filter((i) => i.severity === 'warning'),
    checked: {
      products: PRODUCTS.length,
      recipes: recipeCount,
      chains: REQUIRED_CHAINS.length,
      machines: MACHINES.length,
    },
  }
}
