import { QUALITY_MULTIPLIER } from './constants'
import type { CropDef, Plant, Quality, Season } from './types'

/**
 * The crop table. Balance target, assuming the player waters every day, is roughly:
 * starters 4 g/day, mid crops 8-12 g/day, the long cash crops 12-15 g/day. Because
 * `stageDays` counts *watered* days, a missed watering costs a slow crop far more
 * calendar time than a fast one, which is what makes the expensive seeds a gamble.
 *
 * Every `art` block is distinct, and no two crops share a fruit colour — the plant
 * renderer builds the sprite from these numbers alone, so they are the whole look.
 */
export const CROPS: readonly CropDef[] = [
  // ---- SPRING -------------------------------------------------------------
  {
    id: 'parsnip',
    name: 'PARSNIP',
    seasons: ['spring'],
    seedCost: 20,
    basePrice: 35,
    stageDays: [1, 1, 1, 1],
    yieldMin: 1,
    yieldMax: 1,
    regrowDays: null,
    art: { stem: '#4f7a3a', leaf: '#6d9c46', fruit: '#d9c48b', shape: 'root', fruits: 1, height: 5 },
  },
  {
    id: 'tulip',
    name: 'TULIP',
    seasons: ['spring'],
    seedCost: 25,
    basePrice: 44,
    stageDays: [2, 2, 1],
    yieldMin: 1,
    yieldMax: 1,
    regrowDays: null,
    art: { stem: '#5c8a3f', leaf: '#4f7a3a', fruit: '#b06a86', shape: 'long', fruits: 2, height: 9 },
  },
  {
    id: 'cabbage',
    name: 'CABBAGE',
    seasons: ['spring'],
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
    id: 'pepper',
    name: 'PEPPER',
    seasons: ['summer'],
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
    seedCost: 45,
    basePrice: 38,
    stageDays: [2, 2, 2, 2, 1],
    yieldMin: 1,
    yieldMax: 2,
    regrowDays: 3,
    art: { stem: '#3f6b33', leaf: '#2f5c33', fruit: '#9c3f38', shape: 'round', fruits: 3, height: 11 },
  },
  {
    id: 'corn',
    name: 'CORN',
    seasons: ['summer', 'fall'],
    seedCost: 70,
    basePrice: 55,
    stageDays: [2, 2, 2, 2, 2],
    yieldMin: 1,
    yieldMax: 2,
    regrowDays: 4,
    art: { stem: '#5f8f42', leaf: '#7aa64f', fruit: '#e0b355', shape: 'long', fruits: 2, height: 14 },
  },
  {
    id: 'melon',
    name: 'MELON',
    seasons: ['summer'],
    seedCost: 80,
    basePrice: 280,
    stageDays: [3, 3, 3, 2, 2],
    yieldMin: 1,
    yieldMax: 1,
    regrowDays: null,
    art: { stem: '#4f7a3a', leaf: '#3d6b38', fruit: '#7d9a5e', shape: 'round', fruits: 1, height: 6 },
  },

  // ---- FALL ---------------------------------------------------------------
  {
    id: 'barley',
    name: 'BARLEY',
    seasons: ['fall'],
    seedCost: 22,
    basePrice: 16,
    stageDays: [1, 1, 1, 1],
    yieldMin: 2,
    yieldMax: 3,
    regrowDays: null,
    art: { stem: '#8f9a52', leaf: '#a8ac63', fruit: '#c9a96a', shape: 'cluster', fruits: 5, height: 12 },
  },
  {
    id: 'beet',
    name: 'BEET',
    seasons: ['fall'],
    seedCost: 28,
    basePrice: 48,
    stageDays: [2, 2, 1],
    yieldMin: 1,
    yieldMax: 1,
    regrowDays: null,
    art: { stem: '#5c7f42', leaf: '#7aa64f', fruit: '#8e4258', shape: 'root', fruits: 2, height: 5 },
  },
  {
    id: 'grape',
    name: 'GRAPE',
    seasons: ['fall'],
    seedCost: 60,
    basePrice: 36,
    stageDays: [2, 2, 2, 2],
    yieldMin: 1,
    yieldMax: 2,
    regrowDays: 3,
    art: { stem: '#5a6b3a', leaf: '#4f7a3a', fruit: '#7a6a9c', shape: 'cluster', fruits: 5, height: 10 },
  },
  {
    id: 'pumpkin',
    name: 'PUMPKIN',
    seasons: ['fall'],
    seedCost: 75,
    basePrice: 235,
    stageDays: [3, 3, 3, 2],
    yieldMin: 1,
    yieldMax: 1,
    regrowDays: null,
    art: { stem: '#3f6b33', leaf: '#4f7a3a', fruit: '#cf8340', shape: 'round', fruits: 1, height: 7 },
  },

  // ---- WINTER -------------------------------------------------------------
  {
    id: 'snowdrop',
    name: 'SNOWDROP',
    seasons: ['winter'],
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
    seedCost: 55,
    basePrice: 78,
    stageDays: [2, 2, 2, 1],
    yieldMin: 1,
    yieldMax: 2,
    regrowDays: null,
    art: { stem: '#6a7a72', leaf: '#87968c', fruit: '#a8c6d4', shape: 'round', fruits: 3, height: 4 },
  },
]

const BY_ID: ReadonlyMap<string, CropDef> = new Map(CROPS.map((c) => [c.id, c]))

export function cropById(id: string): CropDef | undefined {
  return BY_ID.get(id)
}

/** Throws if the id is unknown. Use where a missing crop is a programming error. */
export function requireCrop(id: string): CropDef {
  const crop = BY_ID.get(id)
  if (!crop) throw new Error(`requireCrop: unknown crop "${id}"`)
  return crop
}

export function cropsForSeason(season: Season): CropDef[] {
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
