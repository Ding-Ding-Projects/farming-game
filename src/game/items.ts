/**
 * The `ItemRef` vocabulary: keying, naming and copying one reference to a thing.
 *
 * These three functions are the only place in `src/game` that has to know every variant of
 * `ItemRef`, so they live apart from `state.ts` rather than inside it. `storage.ts` needs
 * `itemName` for a refusal message and `state.ts` needs `storage.ts` for the cap on the bag;
 * putting the vocabulary in its own module is what keeps that a line rather than a loop.
 *
 * Pure per `docs/ARCHITECTURE.md`: catalogue lookups and string building, nothing else.
 */
import { cropById } from './crops'
import { materialName } from './materials'
import { productById } from './products'
import { treeById } from './trees'
import type { ItemRef } from './types'

/**
 * The bag's key for an item.
 *
 * **Quality-sensitive on purpose** — a gold melon and a normal melon are two stacks, because
 * the player sells them for different money. `economy.marketKey` is the quality-*insensitive*
 * counterpart the market prices against; the two are not interchangeable.
 */
export function itemKey(item: ItemRef): string {
  switch (item.kind) {
    case 'seed':
      return `seed:${item.cropId}`
    case 'produce':
      return `produce:${item.cropId}:${item.quality}`
    case 'good':
      return `good:${item.goodId}`
    case 'product':
      return `product:${item.productId}:${item.quality}`
    case 'material':
      return `material:${item.materialId}`
  }
}

/** Crops and fruit trees share the produce and seed variants, so both catalogues answer. */
function plantLabel(cropId: string): string {
  const plant = cropById(cropId) ?? treeById(cropId)
  return (plant ? plant.name : cropId).toUpperCase()
}

/** `SILVER` / `GOLD` in front of the name; a normal grade says nothing at all. */
function graded(label: string, quality: string): string {
  if (quality === 'silver') return `SILVER ${label}`
  if (quality === 'gold') return `GOLD ${label}`
  return label
}

export function itemName(item: ItemRef): string {
  switch (item.kind) {
    case 'seed':
      return `${plantLabel(item.cropId)} SEEDS`
    case 'produce':
      return graded(plantLabel(item.cropId), item.quality)
    case 'good':
      return item.goodId.toUpperCase()
    case 'product': {
      const def = productById(item.productId)
      return graded((def ? def.name : item.productId).toUpperCase(), item.quality)
    }
    case 'material':
      return materialName(item.materialId)
  }
}

/** A detached copy, so two states can never share one reference. */
export function cloneItem(item: ItemRef): ItemRef {
  switch (item.kind) {
    case 'seed':
      return { kind: 'seed', cropId: item.cropId }
    case 'produce':
      return { kind: 'produce', cropId: item.cropId, quality: item.quality }
    case 'good':
      return { kind: 'good', goodId: item.goodId }
    case 'product':
      return { kind: 'product', productId: item.productId, quality: item.quality }
    case 'material':
      return { kind: 'material', materialId: item.materialId }
  }
}
