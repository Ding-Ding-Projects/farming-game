import { cropById, isRipe } from '../game/crops'
import type { GameState, Ground, Plant, Tile } from '../game/types'

const GROUND_WORDS: Record<Ground, string> = {
  grass: 'GRASS',
  soil: 'TILLED SOIL',
  weeds: 'WEEDS',
  rock: 'ROCK',
  log: 'FALLEN LOG',
  water: 'POND WATER',
  path: 'PATH',
}

let region: HTMLElement | null = null
let lastSpoken = ''

function liveRegion(): HTMLElement | null {
  if (region && region.isConnected) return region
  region = typeof document === 'undefined' ? null : document.getElementById('live')
  return region
}

/**
 * Mirrors one state change into the visually hidden live region. Consecutive
 * identical messages are dropped: walking along a row of grass should not make a
 * screen reader say "GRASS" twenty times.
 */
export function announce(text: string): void {
  const message = text.trim().replace(/\s+/g, ' ')
  if (message.length === 0 || message === lastSpoken) return
  const el = liveRegion()
  if (!el) return
  el.textContent = message
  lastSpoken = message
}

function plantPhrase(plant: Plant): string {
  const crop = cropById(plant.cropId)
  const name = crop ? crop.name : plant.cropId.toUpperCase()
  if (plant.dead) return `${name} WITHERED`
  if (crop && isRipe(plant, crop)) return `${name} RIPE`
  if (plant.stage === 0) return `${name} SEEDLING`
  if (crop) return `${name} GROWING, STAGE ${plant.stage + 1} OF ${crop.stageDays.length}`
  return `${name} GROWING`
}

/** A short spoken sentence for one tile, e.g. "TILLED SOIL, WATERED, PARSNIP RIPE". */
export function describeTile(state: GameState, index: number): string {
  const tile: Tile | undefined = state.tiles[index]
  if (!tile) return 'OFF THE FARM'

  const parts: string[] = [GROUND_WORDS[tile.ground]]
  const living = tile.plant !== null && !tile.plant.dead
  if (tile.watered) parts.push('WATERED')
  else if (living) parts.push('DRY')
  if (tile.fertilized) parts.push('FERTILIZED')
  if (tile.sprinkler) parts.push('SPRINKLER')
  if (tile.plant) parts.push(plantPhrase(tile.plant))
  return parts.join(', ')
}
