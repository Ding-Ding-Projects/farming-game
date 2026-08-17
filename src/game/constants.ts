/**
 * Fixed low-resolution framebuffer. Everything is drawn here, then upscaled by a
 * whole number.
 *
 * Exactly 2x the original 320x224, which is why the farm grid, the band layout and
 * the 1280x896 window are all unchanged by the move to 32px tiles: every constant
 * below simply doubled. See docs/GRAPHICS.md.
 */
export const LOGICAL_W = 640
export const LOGICAL_H = 448

/** Every tile and character sprite is this many pixels square. */
export const TILE = 32

/** Playable farm grid, row-major. */
export const FARM_W = 20
export const FARM_H = 11

/** Vertical band layout of the logical framebuffer. */
export const HUD_H = 48
export const WORLD_Y = HUD_H
export const WORLD_H = FARM_H * TILE
export const BELT_Y = WORLD_Y + WORLD_H
export const BELT_H = LOGICAL_H - BELT_Y

/** Calendar. */
export const DAYS_PER_SEASON = 28
export const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const

/** Clock, in minutes from midnight. The day runs 6:00 AM to 2:00 AM. */
export const DAY_START = 6 * 60
export const DAY_END = 26 * 60
export const ACTION_MINUTES = 10

/** Energy. */
export const START_ENERGY = 100
export const ENERGY_CAP = 200

/** Energy cost per action, by what the action does. */
export const ENERGY_COST = {
  till: 2,
  water: 2,
  plant: 1,
  harvest: 1,
  clearWeeds: 2,
  clearRock: 4,
  clearLog: 5,
  sprinkler: 1,
  fertilize: 1,
} as const

/** Starting purse. */
export const START_GOLD = 500

/** Sale multiplier per produce quality. */
export const QUALITY_MULTIPLIER = {
  normal: 1,
  silver: 1.25,
  gold: 1.5,
} as const

/** Consecutive dry days a sprouted plant survives before it withers. */
export const DRY_DAYS_TO_WITHER = 3

/** Save format. Bump when the shape of GameState changes incompatibly. */
export const SAVE_VERSION = 1
