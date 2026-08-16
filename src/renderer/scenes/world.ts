import type { ActionResult, Fx, GameState, Tile, ToolId } from '../../game/types'
import type { Input } from '../../engine/input'
import type { Scene, SceneCommand, SceneContext } from '../scene'
import {
  BELT_Y,
  FARM_W,
  HUD_H,
  LOGICAL_W,
  TILE,
  WORLD_H,
  WORLD_Y,
} from '../../game/constants'
import { countItem, facingIndex } from '../../game/state'
import { movePlayer, selectSeed, setTool, useTool } from '../../game/actions'
import { cropById, isRipe } from '../../game/crops'
import { formatClock, formatDate, isNight } from '../../game/time'
import { PAL, withAlpha } from '../../engine/palette'
import { drawText, textWidth } from '../../engine/font'
import { dither, hline, outline, px, rect, vline, woodPanel } from '../../engine/pixel'
import { isMuted, playSound, setMuted, unlockAudio } from '../../engine/audio'
import {
  artNoise,
  drawGround,
  drawTileOverlay,
  mixHex,
  prefersReducedMotion,
} from '../../art/tiles'
import { drawPlant, drawSeedIcon } from '../../art/plants'
import { drawFarmer, drawToolIcon } from '../../art/actors'
import { drawFarmhouse, drawLightLayer, drawWeatherLayer } from '../../art/scenery'
import { describeTile } from '../announce'
import { createShopScene } from './shop'
import { createInventoryScene } from './inventory'
import { createSleepScene } from './sleep'
import { createHelpScene } from './help'

/** One tile every 180 ms, the tween length from DESIGN section 5. */
const MOVE_MS = 180

const TOOLS: readonly ToolId[] = ['hoe', 'can', 'seeds', 'hand', 'axe', 'sprinkler', 'fertilizer']

const TOOL_NAME: Record<ToolId, string> = {
  hoe: 'HOE',
  can: 'WATERING CAN',
  seeds: 'SEED BAG',
  hand: 'HANDS',
  axe: 'AXE',
  sprinkler: 'SPRINKLER',
  fertilizer: 'FERTILIZER',
}

/** Mirrors the farmhouse footprint laid down in game/state.ts. */
const HOUSE_TX = 1
const HOUSE_TY = 0
const HOUSE_TILES_H = 3

const QUIET = mixHex(PAL.ink, PAL.parchment, 0.42)
const RECESS = mixHex(PAL.parchment, PAL.soil, 0.5)

/** Specks must read against the ground they came off, so they are not that ground's colour. */
const SPECK_LIGHT = mixHex(PAL.soil, PAL.cream, 0.45)
const SPECK_DARK = PAL.soilWet
const CHAFF = mixHex(PAL.grassLit, PAL.cream, 0.4)

/** Belt slot origins. The gap after the seeds slot holds the loaded seed. */
const SLOT_X = [6, 23, 40, 76, 93, 110, 127] as const
const SEED_CHIP_X = 57
const ICON_Y = BELT_Y + 5
const INFO_X = 152

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  /** Milliseconds left, and the span it started with, for the fade. */
  life: number
  max: number
  grav: number
  color: string
  size: number
  /** Sparkles blink on the 6 fps beat instead of fading smoothly. */
  twinkle: boolean
}

const MAX_PARTICLES = 140

function tileLabel(tile: Tile): string {
  const plant = tile.plant
  if (plant !== null) {
    const crop = cropById(plant.cropId)
    const name = crop === undefined ? 'PLANT' : crop.name
    if (plant.dead) return `WITHERED ${name}`
    if (crop !== undefined && isRipe(plant, crop)) return `${name} - RIPE`
    if (plant.stage === 0) return `${name} - SOWN`
    return `${name} - GROWING`
  }
  if (tile.sprinkler) return 'SPRINKLER'
  switch (tile.ground) {
    case 'soil':
      if (tile.watered) return tile.fertilized ? 'RICH SOIL, WATERED' : 'SOIL, WATERED'
      return tile.fertilized ? 'RICH SOIL, DRY' : 'TILLED SOIL'
    case 'grass':
      return 'GRASS'
    case 'weeds':
      return 'WEEDS'
    case 'rock':
      return 'ROCK'
    case 'log':
      return 'FALLEN LOG'
    case 'water':
      return 'THE POND'
    case 'path':
      return 'THE PATH'
  }
}

/** Seed crop ids actually in the bag, in bag order. */
function heldSeeds(state: GameState): string[] {
  const out: string[] = []
  for (const entry of state.inventory) {
    if (entry.item.kind === 'seed' && entry.count > 0) out.push(entry.item.cropId)
  }
  return out
}

function coin(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  hline(ctx, x + 2, y, 3, PAL.ink)
  hline(ctx, x + 2, y + 6, 3, PAL.ink)
  vline(ctx, x, y + 2, 3, PAL.ink)
  vline(ctx, x + 6, y + 2, 3, PAL.ink)
  px(ctx, x + 1, y + 1, PAL.ink)
  px(ctx, x + 5, y + 1, PAL.ink)
  px(ctx, x + 1, y + 5, PAL.ink)
  px(ctx, x + 5, y + 5, PAL.ink)
  rect(ctx, x + 1, y + 2, 5, 3, PAL.lantern)
  hline(ctx, x + 2, y + 1, 3, mixHex(PAL.lantern, PAL.cream, 0.55))
  hline(ctx, x + 2, y + 5, 3, mixHex(PAL.lantern, PAL.bark, 0.35))
  px(ctx, x + 2, y + 2, PAL.cream)
}

function energyBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number,
  alarm: boolean,
): void {
  const t = fill < 0 ? 0 : fill > 1 ? 1 : fill
  outline(ctx, x, y, w, h, PAL.ink)
  rect(ctx, x + 1, y + 1, w - 2, h - 2, PAL.shadow)
  const fw = Math.round((w - 2) * t)
  if (fw > 0) {
    // Toward berry as it empties: colour carries the warning, the number confirms it.
    const color = mixHex(PAL.berry, PAL.lantern, t)
    rect(ctx, x + 1, y + 1, fw, h - 2, color)
    hline(ctx, x + 1, y + 1, fw, mixHex(color, PAL.cream, 0.4))
  }
  for (let q = 1; q < 4; q++) {
    vline(ctx, x + 1 + Math.round(((w - 2) * q) / 4), y + 1, h - 2, withAlpha(PAL.ink, 0.35))
  }
  if (alarm) outline(ctx, x - 1, y - 1, w + 2, h + 2, PAL.berry)
}

export function createWorldScene(): Scene {
  const particles: Particle[] = []
  let noiseTick = 0

  let toX = -1
  let toY = -1
  let drawX = 0
  let drawY = 0
  let fromX = 0
  let fromY = 0
  let moveT = 0
  let steps = 0
  let moveCooldown = 0

  let prevGold = -1
  let goldFlash = 0

  /** The tile last spoken to the live region, so a screen reader is told once per move. */
  let spokenFaced = -1

  const rnd = (): number => {
    noiseTick = (noiseTick + 1) & 0xffff
    return artNoise(noiseTick, 4271)
  }
  const spread = (n: number): number => (rnd() - 0.5) * 2 * n

  const push = (p: Particle): void => {
    if (particles.length >= MAX_PARTICLES) particles.shift()
    particles.push(p)
  }

  const emit = (kind: Fx['kind'], index: number, color: string | undefined): void => {
    if (prefersReducedMotion()) return
    const cx = (index % FARM_W) * TILE + 8
    const cy = WORLD_Y + Math.floor(index / FARM_W) * TILE + 11

    switch (kind) {
      case 'dirt':
        for (let i = 0; i < 4; i++) {
          push({
            x: cx + spread(3),
            y: cy - 3 - rnd() * 2,
            vx: spread(38),
            vy: -46 - rnd() * 34,
            life: 400,
            max: 400,
            grav: 260,
            color: color ?? (rnd() > 0.3 ? SPECK_LIGHT : SPECK_DARK),
            size: 1,
            twinkle: false,
          })
        }
        break
      case 'splash':
        for (let i = 0; i < 5; i++) {
          push({
            x: cx + spread(5),
            y: cy - rnd() * 3,
            vx: spread(26),
            vy: -18 - rnd() * 26,
            life: 400,
            max: 400,
            grav: 190,
            color: color ?? (rnd() > 0.55 ? PAL.sky : mixHex(PAL.sky, PAL.cream, 0.5)),
            size: 1,
            twinkle: false,
          })
        }
        break
      case 'pop':
        // The crop hops up 2 px, then drifts toward the HUD and fades out.
        for (let i = 0; i < 3; i++) {
          push({
            x: cx - 1 + spread(2),
            y: cy - 2 - i,
            vx: spread(8),
            vy: -26 - i * 6,
            life: 520,
            max: 520,
            grav: 0,
            color: color ?? PAL.cream,
            size: i === 0 ? 2 : 1,
            twinkle: false,
          })
        }
        break
      case 'sparkle':
        for (let i = 0; i < 6; i++) {
          push({
            x: cx + spread(7),
            y: cy - 4 + spread(5),
            vx: spread(9),
            vy: -12 - rnd() * 10,
            life: 620,
            max: 620,
            grav: -6,
            color: color ?? PAL.lantern,
            size: 1,
            twinkle: true,
          })
        }
        break
      case 'leaf':
        for (let i = 0; i < 4; i++) {
          push({
            x: cx + spread(5),
            y: cy - 3 - rnd() * 4,
            vx: spread(22),
            vy: -20 - rnd() * 18,
            life: 620,
            max: 620,
            grav: 110,
            color: color ?? (rnd() > 0.5 ? PAL.leaf : CHAFF),
            size: 1,
            twinkle: false,
          })
        }
        break
    }
  }

  const stepParticles = (dt: number): void => {
    const s = dt / 1000
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.life -= dt
      if (p.life <= 0) {
        particles.splice(i, 1)
        continue
      }
      p.x += p.vx * s
      p.y += p.vy * s
      p.vy += p.grav * s
    }
  }

  const drawParticles = (g: CanvasRenderingContext2D, beat: number): void => {
    for (const p of particles) {
      if (p.twinkle && beat % 2 === 1) continue
      const y = Math.round(p.y)
      if (y < WORLD_Y || y >= WORLD_Y + WORLD_H) continue
      const t = p.life / p.max
      const color = t < 0.4 ? withAlpha(p.color, t / 0.4) : p.color
      rect(g, Math.round(p.x), y, p.size, p.size, color)
    }
  }

  const applyResult = (ctx: SceneContext, result: ActionResult): void => {
    const before = ctx.state
    ctx.state = result.state
    playSound(result.sound)
    for (const fx of result.fx) {
      // A harvest pop is the crop leaving the ground, so it flies in the crop's colour.
      let tint = fx.color
      if (tint === undefined && fx.kind === 'pop') {
        const plant = before.tiles[fx.index]?.plant ?? null
        if (plant !== null) tint = cropById(plant.cropId)?.art.fruit
      }
      emit(fx.kind, fx.index, tint)
    }
    ctx.announce(result.message)
    if (!result.ok) ctx.toast(result.message, 'bad')
    else if (result.sound === 'harvest' || result.sound === 'sell') {
      ctx.toast(result.message, 'good')
    }
  }

  const cycleSeed = (ctx: SceneContext, dir: number): void => {
    const seeds = heldSeeds(ctx.state)
    if (seeds.length === 0) {
      playSound('deny')
      ctx.say('NO SEEDS IN THE BAG. THE SHOP IS ON B.', 'bad')
      return
    }
    const at = ctx.state.selectedSeed === null ? -1 : seeds.indexOf(ctx.state.selectedSeed)
    const next = at < 0 ? (dir > 0 ? 0 : seeds.length - 1) : (at + dir + seeds.length) % seeds.length
    ctx.state = selectSeed(ctx.state, seeds[next])
    playSound('select')
    const crop = cropById(seeds[next])
    ctx.announce(`SEED BAG LOADED WITH ${crop === undefined ? '' : crop.name}.`)
  }

  const handleKeys = (ctx: SceneContext, input: Input): SceneCommand | null => {
    for (let i = 0; i < TOOLS.length; i++) {
      if (!input.pressed(`Digit${i + 1}`)) continue
      const next = setTool(ctx.state, TOOLS[i])
      if (next !== ctx.state) {
        ctx.state = next
        playSound('select')
        ctx.announce(`HOLDING THE ${TOOL_NAME[TOOLS[i]]}.`)
      }
    }
    if (input.pressed('KeyQ')) cycleSeed(ctx, -1)
    if (input.pressed('KeyE')) cycleSeed(ctx, 1)

    if (input.pressed('KeyM')) {
      const next = !isMuted()
      setMuted(next)
      if (!next) playSound('select')
      ctx.say(next ? 'SOUND OFF.' : 'SOUND ON.', 'info')
    }

    if (input.pressed('KeyB')) return { kind: 'push', scene: createShopScene() }
    if (input.pressed('KeyI')) return { kind: 'push', scene: createInventoryScene() }
    if (input.pressed('KeyN')) return { kind: 'push', scene: createSleepScene() }
    if (input.pressed('KeyH') || input.pressed('F1')) {
      return { kind: 'push', scene: createHelpScene() }
    }
    return null
  }

  const drawHud = (ctx: SceneContext, beat: number): void => {
    const g = ctx.g
    const state = ctx.state
    woodPanel(g, -4, -8, LOGICAL_W + 8, HUD_H + 8, { thin: true })

    // Up to the clock and not a pixel further: "WINTER 28, YEAR 10" is 107 px wide.
    drawText(g, formatDate(state), 4, 3, PAL.ink, { maxWidth: 108 })
    drawText(g, formatClock(state.minutes), 112, 3, PAL.ink)

    const gold = `${state.gold}G`
    const gx = LOGICAL_W - 6 - textWidth(gold)
    if (goldFlash > 0) rect(g, gx - 12, 1, textWidth(gold) + 17, 11, withAlpha(PAL.lantern, 0.55))
    coin(g, gx - 10, 3)
    drawText(g, gold, gx, 3, PAL.ink)

    const cap = Math.max(1, state.maxEnergy)
    const fill = state.energy / cap
    drawText(g, 'ENERGY', 4, 13, PAL.ink)
    energyBar(g, 44, 13, 100, 7, fill, fill <= 0.2 && beat % 2 === 0)
    drawText(g, `${state.energy}/${state.maxEnergy}`, 150, 13, fill <= 0.2 ? PAL.berry : PAL.ink)
    drawText(g, state.weather.toUpperCase(), 210, 13, QUIET)
    if (isMuted()) {
      drawText(g, 'MUTED', LOGICAL_W - 6 - textWidth('MUTED'), 13, PAL.berry)
    }
  }

  const drawBelt = (ctx: SceneContext): void => {
    const g = ctx.g
    const state = ctx.state
    woodPanel(g, -4, BELT_Y - 4, LOGICAL_W + 8, 40, { thin: true })

    for (let i = 0; i < TOOLS.length; i++) {
      const tool = TOOLS[i]
      const chosen = state.tool === tool
      const bx = SLOT_X[i] - 2
      const by = chosen ? ICON_Y - 4 : ICON_Y - 2
      const bh = chosen ? 18 : 16
      if (chosen) {
        rect(g, bx, by, 16, bh, PAL.lantern)
        hline(g, bx + 1, by + 1, 14, mixHex(PAL.lantern, PAL.cream, 0.5))
        outline(g, bx, by, 16, bh, PAL.ink)
      } else {
        dither(g, bx + 1, by + 1, 14, 14, RECESS)
        outline(g, bx, by, 16, 16, mixHex(PAL.parchment, PAL.ink, 0.3))
      }
      drawToolIcon(g, tool, SLOT_X[i], chosen ? ICON_Y - 2 : ICON_Y)
    }

    // The loaded seed, tied to the seed bag slot it feeds.
    const crop = state.selectedSeed === null ? undefined : cropById(state.selectedSeed)
    hline(g, SLOT_X[2] + 14, ICON_Y + 6, SEED_CHIP_X - SLOT_X[2] - 14, PAL.bark)
    dither(g, SEED_CHIP_X - 1, ICON_Y - 1, 14, 14, RECESS)
    outline(g, SEED_CHIP_X - 2, ICON_Y - 2, 16, 16, mixHex(PAL.parchment, PAL.ink, 0.3))
    if (crop === undefined) {
      outline(g, SEED_CHIP_X + 3, ICON_Y + 3, 6, 6, PAL.dusk)
    } else {
      drawSeedIcon(g, crop, SEED_CHIP_X, ICON_Y)
    }

    vline(g, INFO_X - 6, BELT_Y + 1, 18, mixHex(PAL.parchment, PAL.bark, 0.55))

    const seedLine =
      crop === undefined
        ? 'SEED: NONE - Q OR E PICKS ONE'
        : `SEED: ${crop.name} X${countItem(state, { kind: 'seed', cropId: crop.id })}`
    drawText(g, seedLine, INFO_X, BELT_Y + 1, PAL.ink, { maxWidth: LOGICAL_W - 6 - INFO_X })

    const facing = state.tiles[facingIndex(state)]
    drawText(g, `AHEAD: ${tileLabel(facing)}`, INFO_X, BELT_Y + 11, PAL.ink, {
      maxWidth: LOGICAL_W - 6 - INFO_X,
    })
  }

  return {
    id: 'world',

    update(ctx: SceneContext, input, ui, dt, frame): SceneCommand | null {
      ctx.tick(dt, frame)
      const g = ctx.g
      if (input.anyPressed()) unlockAudio()

      // ---- input -------------------------------------------------------
      const held = (a: string, b: string): boolean => input.down(a) || input.down(b)
      let dx = 0
      let dy = 0
      if (held('ArrowLeft', 'KeyA')) dx -= 1
      if (held('ArrowRight', 'KeyD')) dx += 1
      if (held('ArrowUp', 'KeyW')) dy -= 1
      if (held('ArrowDown', 'KeyS')) dy += 1

      moveCooldown -= dt
      if (dx === 0 && dy === 0) {
        moveCooldown = 0
      } else if (moveCooldown <= 0) {
        ctx.state = movePlayer(ctx.state, dx, dy)
        moveCooldown = MOVE_MS
      }

      // Walking or turning is a state change, so the live region hears the new tile
      // before anything is done to it. Actions speak for themselves in applyResult.
      const faced = facingIndex(ctx.state)
      if (faced !== spokenFaced) {
        spokenFaced = faced
        ctx.announce(describeTile(ctx.state, faced))
      }

      if (input.pressed('Space') || input.pressed('Enter') || input.pressed('NumpadEnter')) {
        applyResult(ctx, useTool(ctx.state))
      }
      const command = handleKeys(ctx, input)

      // ---- the farmer's tween -------------------------------------------
      const player = ctx.state.player
      if (toX < 0) {
        toX = player.x
        toY = player.y
        fromX = player.x
        fromY = player.y
        drawX = player.x
        drawY = player.y
        moveT = MOVE_MS
      }
      if (player.x !== toX || player.y !== toY) {
        fromX = drawX
        fromY = drawY
        toX = player.x
        toY = player.y
        moveT = 0
        steps += 1
      }
      moveT += dt
      const k = Math.min(1, moveT / MOVE_MS)
      drawX = fromX + (toX - fromX) * k
      drawY = fromY + (toY - fromY) * k

      // ---- the farm ------------------------------------------------------
      const state = ctx.state
      const season = state.season

      for (let i = 0; i < state.tiles.length; i++) {
        const sx = (i % FARM_W) * TILE
        const sy = WORLD_Y + Math.floor(i / FARM_W) * TILE
        drawGround(g, state.tiles[i], sx, sy, season, frame)
        drawTileOverlay(g, state.tiles[i], sx, sy, frame)
      }

      for (let i = 0; i < state.tiles.length; i++) {
        const plant = state.tiles[i].plant
        if (plant === null) continue
        const crop = cropById(plant.cropId)
        if (crop === undefined) continue
        drawPlant(g, crop, plant, (i % FARM_W) * TILE, WORLD_Y + Math.floor(i / FARM_W) * TILE, frame)
      }

      const farmerX = Math.round(drawX * TILE)
      const farmerY = WORLD_Y + Math.round(drawY * TILE)
      const drawHouse = (): void => {
        drawFarmhouse(g, HOUSE_TX * TILE, WORLD_Y + HOUSE_TY * TILE, season, isNight(state.minutes))
      }
      const drawWalker = (): void => {
        drawFarmer(g, player.facing, farmerX, farmerY, k < 1 ? steps : 0, state.tool)
      }
      // Sorted by the row each thing stands on, so the farmer passes behind the house.
      if (WORLD_Y + (HOUSE_TY + HOUSE_TILES_H) * TILE <= farmerY + TILE) {
        drawHouse()
        drawWalker()
      } else {
        drawWalker()
        drawHouse()
      }

      stepParticles(dt)
      drawParticles(g, ctx.beat)

      drawWeatherLayer(g, state.weather, frame)
      drawLightLayer(g, state.minutes, state.weather)

      // ---- cursor, above the light so position is never lost ------------
      const index = facingIndex(state)
      const cx = (index % FARM_W) * TILE
      const cy = WORLD_Y + Math.floor(index / FARM_W) * TILE
      const pulse = ctx.beat % 2 === 0 ? PAL.cream : withAlpha(PAL.cream, 0.5)
      outline(g, cx - 1, cy - 1, TILE + 2, TILE + 2, withAlpha(PAL.ink, 0.45))
      outline(g, cx, cy, TILE, TILE, pulse)
      outline(g, cx + 1, cy + 1, TILE - 2, TILE - 2, pulse)

      // ---- HUD and belt, unlit -------------------------------------------
      goldFlash = Math.max(0, goldFlash - dt)
      if (prevGold >= 0 && state.gold > prevGold) goldFlash = 250
      prevGold = state.gold

      ui.begin(g, input)
      drawHud(ctx, ctx.beat)
      drawBelt(ctx)
      ui.end()

      ctx.toastY = BELT_Y - 6

      if (command !== null) return command
      if (state.passedOut) return { kind: 'push', scene: createSleepScene() }
      return null
    },
  }
}
