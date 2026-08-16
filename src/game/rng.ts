/**
 * Deterministic randomness for the whole game. Nothing here reads the clock or calls
 * Math.random, so a given (seed, salt) pair always produces the same stream.
 */

/** Mulberry32: 32-bit state, good distribution, three lines. Returns [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Stable 32-bit hash of a string (FNV-1a). Used to fold salts into the seed. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Deterministic generator for one (state, salt) pair. Same inputs, same stream. */
export function rngFor(seed: number, salt: string): () => number {
  // Multiply the salt hash by a golden-ratio constant before folding, so salts that
  // differ by one character ("crop:1" / "crop:2") land far apart in the seed space.
  let s = (seed >>> 0) ^ Math.imul(hashString(salt), 0x9e3779b1)
  s = Math.imul(s ^ (s >>> 16), 0x85ebca6b)
  return mulberry32(s >>> 0)
}

export function pick<T>(rand: () => number, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick: cannot pick from an empty list')
  const i = Math.min(items.length - 1, Math.floor(rand() * items.length))
  return items[i]
}

/** Inclusive at both ends. Tolerates a reversed or fractional range. */
export function randInt(rand: () => number, min: number, max: number): number {
  const lo = Math.ceil(Math.min(min, max))
  const hi = Math.floor(Math.max(min, max))
  if (hi <= lo) return lo
  return lo + Math.min(hi - lo, Math.floor(rand() * (hi - lo + 1)))
}
