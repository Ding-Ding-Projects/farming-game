import { QUALITY_MULTIPLIER } from './constants'
import type { CropDef, Plant, Quality, Season } from './types'

/**
 * The crop table — the 26 field crops of `docs/CATALOG.md` section 1, plus the seven
 * originals the save format and sixty action tests were written against.
 *
 * Balance target, assuming the player waters every day, is profit per crop-day:
 * starters 3-5 g/day, mid crops 6-10 g/day, the long cash crops 12-15 g/day. Because
 * `stageDays` counts *watered* days, a missed watering costs a slow crop far more
 * calendar time than a fast one, which is what makes the expensive seeds a gamble.
 * A regrowing crop is measured across a whole 28-day season — its first harvest is
 * usually a loss and everything after it is profit, which is the shape of the bet.
 *
 * **Wheat and corn are deliberately terrible to sell.** Wheat clears about 1.7 g/day
 * raw and corn about 3.6 — below every other crop in the table, including the level-1
 * parsnip. What they produce is *units*: 3-4 wheat per tile every four days, 3-4 corn
 * per tile every three. That volume is what the Mill, the Feed Mill and half the
 * chains behind them eat, so the correct play is to hold them, not to sell them.
 *
 * `level` is the progression gate (`docs/PROGRESSION.md` section 1). The shop shows a
 * locked crop greyed with its level stated, never hidden.
 *
 * Every `art` block is distinct, and no two crops share a fruit colour — the plant
 * renderer builds the sprite from these numbers alone, so they are the whole look.
 * The five shapes are spread across the table: 8 cluster, 8 long, 7 root, 5 leafy,
 * 5 round.
 */
export interface CropEntry extends CropDef {
  /** Farming level required before the shop will sell the seed. */
  level: number
}

export const CROPS: readonly CropEntry[] = [
  // ---- SPRING -------------------------------------------------------------
  {
    id: 'wheat',
    name: 'WHEAT',
    seasons: ['spring', 'fall'],
    level: 1,
    seedCost: 14,
    basePrice: 6,
    stageDays: [1, 1, 1, 1],
    yieldMin: 3,
    yieldMax: 4,
    regrowDays: null,
    art: { stem: '#b9a75a', leaf: '#cbbb6d', fruit: '#e8d18a', shape: 'cluster', fruits: 5, height: 13 },
  },
  {
    id: 'carrot',
    name: 'CARROT',
    seasons: ['spring'],
    level: 1,
    seedCost: 10,
    basePrice: 16,
    stageDays: [1, 1, 1],
    yieldMin: 1,
    yieldMax: 2,
    regrowDays: null,
    art: { stem: '#4f7a3a', leaf: '#6d9c46', fruit: '#e08a3c', shape: 'root', fruits: 4, height: 6 },
  },
  {
    id: 'parsnip',
    name: 'PARSNIP',
    seasons: ['spring'],
    level: 1,
    seedCost: 20,
    basePrice: 35,
    stageDays: [1, 1, 1, 1],
    yieldMin: 1,
    yieldMax: 1,
    regrowDays: null,
    art: { stem: '#4f7a3a', leaf: '#6d9c46', fruit: '#d9c48b', shape: 'root', fruits: 1, height: 5 },
  },
  {
    id: 'lettuce',
    name: 'LETTUCE',
    seasons: ['spring'],
    level: 2,
    seedCost: 12,
    basePrice: 30,
    stageDays: [1, 1, 1, 1],
    yieldMin: 1,
    yieldMax: 1,
    regrowDays: null,
    art: { stem: '#4a7a40', leaf: '#79a94e', fruit: '#a8c46a', shape: 'leafy', fruits: 1, height: 7 },
  },
  {
    id: 'potato',
    name: 'POTATO',
    seasons: ['spring'],
    level: 3,
    seedCost: 15,
    basePrice: 20,
    stageDays: [1, 2, 2],
    yieldMin: 1,
    yieldMax: 3,
    regrowDays: null,
    art: { stem: '#46703a', leaf: '#628d45', fruit: '#c9a878', shape: 'root', fruits: 3, height: 6 },
  },
  {
    id: 'radish',
    name: 'RADISH',
    seasons: ['spring'],
    level: 4,
    seedCost: 16,
    basePrice: 32,
    stageDays: [1, 1, 2],
    yieldMin: 1,
    yieldMax: 1,
    regrowDays: null,
    art: { stem: '#52803c', leaf: '#74a34a', fruit: '#e0576b', shape: 'root', fruits: 4, height: 5 },
  },
  {
    id: 'tulip',
    name: 'TULIP',
    seasons: ['spring'],
    level: 5,
    seedCost: 25,
    basePrice: 44,
    stageDays: [2, 2, 1],
    yieldMin: 1,
    yieldMax: 1,
    regrowDays: null,
    art: { stem: '#5c8a3f', leaf: '#4f7a3a', fruit: '#b06a86', shape: 'long', fruits: 2, height: 9 },
  },
  {
    id: 'onion',
    name: 'ONION',
    seasons: ['spring'],
    level: 6,
    seedCost: 22,
    basePrice: 42,
    stageDays: [2, 2, 1],
    yieldMin: 1,
    yieldMax: 1,
    regrowDays: null,
    art: { stem: '#6b8a4a', leaf: '#86a55a', fruit: '#b9a3c4', shape: 'round', fruits: 2, height: 8 },
  },
  {
    id: 'peas',
    name: 'PEAS',
    seasons: ['spring'],
    level: 7,
    seedCost: 45,
    basePrice: 14,
    stageDays: [2, 2, 2],
    yieldMin: 2,
    yieldMax: 3,
    regrowDays: 3,
    art: { stem: '#4f8a3c', leaf: '#6fae4c', fruit: '#7fb35c', shape: 'long', fruits: 3, height: 10 },
  },
  {
    id: 'cabbage',
    name: 'CABBAGE',
    seasons: ['spring'],
    level: 8,
    seedCost: 35,
    basePrice: 78,
    stageDays: [2, 2, 2, 1],
    yieldMin: 1,
    yieldMax: 1,
    regrowDays: null,
    art: { stem: '#3f6b33', leaf: '#5f8f42', fruit: '#8fa85c', shape: 'leafy', fruits: 1, height: 8 },
  },
  {
    id: 'strawberry',
    name: 'STRAWBERRY',
    seasons: ['spring'],
    level: 12,
    seedCost: 100,
    basePrice: 52,
    stageDays: [2, 2, 2, 2],
    yieldMin: 1,
    yieldMax: 2,
    regrowDays: 5,
    art: { stem: '#4a7238', leaf: '#6d9c46', fruit: '#c1504a', shape: 'cluster', fruits: 4, height: 5 },
  },

  // ---- SUMMER -------------------------------------------------------------
  {
    id: 'corn',
    name: 'CORN',
    seasons: ['summer', 'fall'],
    level: 2,
    seedCost: 20,
    basePrice: 5,
    stageDays: [2, 2, 2, 2],
    yieldMin: 3,
    yieldMax: 4,
    regrowDays: 3,
    art: { stem: '#5f8f42', leaf: '#7aa64f', fruit: '#e0b355', shape: 'long', fruits: 2, height: 14 },
  },
  {
    id: 'cucumber',
    name: 'CUCUMBER',
    seasons: ['summer'],
    level: 7,
    seedCost: 24,
    basePrice: 24,
    stageDays: [1, 2, 2],
    yieldMin: 1,
    yieldMax: 2,
    regrowDays: 4,
    art: { stem: '#3f6b33', leaf: '#58853d', fruit: '#3f7a3e', shape: 'long', fruits: 3, height: 9 },
  },
  {
    id: 'pepper',
    name: 'PEPPER',
    seasons: ['summer'],
    level: 9,
    seedCost: 40,
    basePrice: 36,
    stageDays: [2, 2, 1, 1],
    yieldMin: 1,
    yieldMax: 2,
    regrowDays: 4,
    art: { stem: '#456f36', leaf: '#5f8f42', fruit: '#d4762f', shape: 'long', fruits: 3, height: 8 },
  },
  {
    id: 'tomato',
    name: 'TOMATO',
    seasons: ['summer'],
    level: 10,
    seedCost: 45,
    basePrice: 38,
    stageDays: [2, 2, 2, 2, 1],
    yieldMin: 1,
    yieldMax: 2,
    regrowDays: 3,
    art: { stem: '#3f6b33', leaf: '#2f5c33', fruit: '#9c3f38', shape: 'round', fruits: 3, height: 11 },
  },
  {
    id: 'chilli',
    name: 'CHILLI',
    seasons: ['summer'],
    level: 14,
    seedCost: 30,
    basePrice: 32,
    stageDays: [2, 2, 2],
    yieldMin: 1,
    yieldMax: 2,
    regrowDays: 4,
    art: { stem: '#4a7238', leaf: '#66934a', fruit: '#d1362b', shape: 'long', fruits: 3, height: 9 },
  },
  {
    id: 'sugarcane',
    name: 'SUGARCANE',
    seasons: ['summer'],
    level: 16,
    seedCost: 40,
    basePrice: 12,
    stageDays: [2, 2, 2, 2],
    yieldMin: 3,
    yieldMax: 4,
    regrowDays: 3,
    art: { stem: '#8fae4e', leaf: '#a6c25e', fruit: '#c2cc72', shape: 'long', fruits: 3, height: 14 },
  },
  {
    id: 'cotton',
    name: 'COTTON',
    seasons: ['summer'],
    level: 18,
    seedCost: 35,
    basePrice: 30,
    stageDays: [2, 2, 2, 2],
    yieldMin: 2,
    yieldMax: 2,
    regrowDays: 5,
    art: { stem: '#6b7a48', leaf: '#879159', fruit: '#fbfaf5', shape: 'cluster', fruits: 5, height: 10 },
  },
  {
    id: 'melon',
    name: 'MELON',
    seasons: ['summer'],
    level: 20,
    seedCost: 80,
    basePrice: 280,
    stageDays: [3, 3, 3, 2, 2],
    yieldMin: 1,
    yieldMax: 1,
    regrowDays: null,
    art: { stem: '#4f7a3a', leaf: '#3d6b38', fruit: '#7d9a5e', shape: 'round', fruits: 1, height: 6 },
  },
  {
    id: 'soybean',
    name: 'SOYBEAN',
    seasons: ['summer'],
    level: 22,
    seedCost: 26,
    basePrice: 15,
    stageDays: [2, 2, 1],
    yieldMin: 3,
    yieldMax: 4,
    regrowDays: 4,
    art: { stem: '#5c8a3f', leaf: '#7aa64f', fruit: '#bcc48a', shape: 'cluster', fruits: 6, height: 9 },
  },

  // ---- FALL ---------------------------------------------------------------
  {
    id: 'barley',
    name: 'BARLEY',
    seasons: ['fall'],
    level: 3,
    seedCost: 22,
    basePrice: 16,
    stageDays: [1, 1, 1, 1],
    yieldMin: 2,
    yieldMax: 3,
    regrowDays: null,
    art: { stem: '#8f9a52', leaf: '#a8ac63', fruit: '#c9a96a', shape: 'cluster', fruits: 5, height: 12 },
  },
  {
    id: 'spinach',
    name: 'SPINACH',
    seasons: ['fall'],
    level: 5,
    seedCost: 16,
    basePrice: 22,
    stageDays: [1, 1, 1, 1],
    yieldMin: 1,
    yieldMax: 2,
    regrowDays: null,
    art: { stem: '#35704a', leaf: '#4d8a5c', fruit: '#2f6b4f', shape: 'leafy', fruits: 1, height: 6 },
  },
  {
    id: 'beet',
    name: 'BEET',
    seasons: ['fall'],
    level: 7,
    seedCost: 28,
    basePrice: 48,
    stageDays: [2, 2, 1],
    yieldMin: 1,
    yieldMax: 1,
    regrowDays: null,
    art: { stem: '#5c7f42', leaf: '#7aa64f', fruit: '#8e4258', shape: 'root', fruits: 2, height: 5 },
  },
  {
    id: 'garlic',
    name: 'GARLIC',
    seasons: ['fall'],
    level: 11,
    seedCost: 18,
    basePrice: 34,
    stageDays: [1, 2, 2],
    yieldMin: 1,
    yieldMax: 2,
    regrowDays: null,
    art: { stem: '#6f8a52', leaf: '#93a862', fruit: '#ddd0e4', shape: 'root', fruits: 3, height: 7 },
  },
  {
    id: 'grape',
    name: 'GRAPE',
    seasons: ['fall'],
    level: 13,
    seedCost: 60,
    basePrice: 36,
    stageDays: [2, 2, 2, 2],
    yieldMin: 1,
    yieldMax: 2,
    regrowDays: 3,
    art: { stem: '#5a6b3a', leaf: '#4f7a3a', fruit: '#7a6a9c', shape: 'cluster', fruits: 5, height: 10 },
  },
  {
    id: 'squash',
    name: 'SQUASH',
    seasons: ['fall'],
    level: 15,
    seedCost: 45,
    basePrice: 80,
    stageDays: [2, 2, 2, 2],
    yieldMin: 1,
    yieldMax: 2,
    regrowDays: null,
    art: { stem: '#3f6b33', leaf: '#5f8f42', fruit: '#dfa24e', shape: 'long', fruits: 2, height: 7 },
  },
  {
    id: 'pumpkin',
    name: 'PUMPKIN',
    seasons: ['fall'],
    level: 24,
    seedCost: 75,
    basePrice: 235,
    stageDays: [3, 3, 3, 2],
    yieldMin: 1,
    yieldMax: 1,
    regrowDays: null,
    art: { stem: '#3f6b33', leaf: '#4f7a3a', fruit: '#cf8340', shape: 'round', fruits: 1, height: 7 },
  },
  {
    id: 'rice',
    name: 'RICE',
    seasons: ['fall'],
    level: 26,
    seedCost: 30,
    basePrice: 20,
    stageDays: [2, 2, 2, 2],
    yieldMin: 4,
    yieldMax: 6,
    regrowDays: null,
    art: { stem: '#9aa855', leaf: '#b3bd67', fruit: '#f2ead2', shape: 'cluster', fruits: 6, height: 11 },
  },
  {
    id: 'indigo',
    name: 'INDIGO',
    seasons: ['fall'],
    level: 28,
    seedCost: 60,
    basePrice: 90,
    stageDays: [2, 2, 2, 2, 2],
    yieldMin: 1,
    yieldMax: 2,
    regrowDays: null,
    art: { stem: '#4a6b52', leaf: '#5f8a63', fruit: '#3b4f9c', shape: 'cluster', fruits: 4, height: 9 },
  },

  // ---- WINTER -------------------------------------------------------------
  {
    id: 'snowdrop',
    name: 'SNOWDROP',
    seasons: ['winter'],
    level: 6,
    seedCost: 30,
    basePrice: 52,
    stageDays: [2, 2, 1],
    yieldMin: 1,
    yieldMax: 1,
    regrowDays: null,
    art: { stem: '#5a7a63', leaf: '#86a189', fruit: '#f0e6c8', shape: 'leafy', fruits: 3, height: 7 },
  },
  {
    id: 'winterroot',
    name: 'WINTERROOT',
    seasons: ['winter'],
    level: 9,
    seedCost: 30,
    basePrice: 62,
    stageDays: [2, 2, 2],
    yieldMin: 1,
    yieldMax: 1,
    regrowDays: null,
    art: { stem: '#5f7a5a', leaf: '#7a9070', fruit: '#b98f6b', shape: 'root', fruits: 2, height: 6 },
  },
  {
    id: 'frostcap',
    name: 'FROSTCAP',
    seasons: ['winter'],
    level: 18,
    seedCost: 55,
    basePrice: 78,
    stageDays: [2, 2, 2, 1],
    yieldMin: 1,
    yieldMax: 2,
    regrowDays: null,
    art: { stem: '#6a7a72', leaf: '#87968c', fruit: '#a8c6d4', shape: 'round', fruits: 3, height: 4 },
  },
  {
    id: 'snowcabbage',
    name: 'SNOW CABBAGE',
    seasons: ['winter'],
    level: 34,
    seedCost: 90,
    basePrice: 165,
    stageDays: [3, 3, 3, 3],
    yieldMin: 1,
    yieldMax: 2,
    regrowDays: null,
    art: { stem: '#5a7a68', leaf: '#86a894', fruit: '#cfe0cf', shape: 'leafy', fruits: 1, height: 8 },
  },
]

const BY_ID: ReadonlyMap<string, CropEntry> = new Map(CROPS.map((c) => [c.id, c]))

export function cropById(id: string): CropEntry | undefined {
  return BY_ID.get(id)
}

/** Throws if the id is unknown. Use where a missing crop is a programming error. */
export function requireCrop(id: string): CropEntry {
  const crop = BY_ID.get(id)
  if (!crop) throw new Error(`requireCrop: unknown crop "${id}"`)
  return crop
}

export function cropsForSeason(season: Season): CropEntry[] {
  return CROPS.filter((c) => c.seasons.includes(season))
}

export function totalGrowDays(crop: CropDef): number {
  let days = 0
  for (const d of crop.stageDays) days += d
  return days
}

export function isRipe(plant: Plant, crop: CropDef): boolean {
  return !plant.dead && plant.cropId === crop.id && plant.stage >= crop.stageDays.length
}

/** Sale value of one produce item at a quality, rounded down. */
export function produceValue(crop: CropDef, quality: Quality): number {
  return Math.floor(crop.basePrice * QUALITY_MULTIPLIER[quality])
}
