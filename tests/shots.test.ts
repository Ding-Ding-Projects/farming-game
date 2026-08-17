/**
 * Renders real game frames to PNG without a browser.
 *
 * Electron cannot be photographed in this environment: Win32 `PrintWindow` returns
 * solid black for Chromium, and on a GPU-less off-screen desktop the renderer never
 * reaches `dom-ready` at all. But the art layer only ever touches nine 2D-context
 * calls, so the honest way out is to implement those nine calls, drive the *real*
 * drawing code, and rasterise the result ourselves. The pixels are the game's own.
 *
 * Skipped unless SHOTS=1, so `npm test` is unaffected:
 *
 *   SHOTS=1 npx vitest run tests/shots.test.ts
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as zlib from 'node:zlib'

import { LOGICAL_W, LOGICAL_H, TILE, FARM_W, FARM_H, WORLD_Y } from '../src/game/constants'
import { createState } from '../src/game/state'
import { requireCrop, cropsForSeason } from '../src/game/crops'
import { drawGround, drawTileOverlay } from '../src/art/tiles'
import { drawPlant } from '../src/art/plants'
import { drawFarmer } from '../src/art/actors'
import { drawFarmhouse, drawTree, drawWeatherLayer, drawLightLayer } from '../src/art/scenery'
import type { GameState } from '../src/game/types'

const OUT = process.env.SHOTS_OUT ?? path.join(process.cwd(), 'docs', 'shots')

/* ------------------------------------------------------------ tiny raster */

interface Clip {
  x0: number
  y0: number
  x1: number
  y1: number
}

interface CtxState {
  tx: number
  ty: number
  sx: number
  sy: number
  clip: Clip
}

/** Parses `#rrggbb`, `#rgb` and `rgba(r,g,b,a)`. Everything the art layer emits. */
function parseColor(css: string): [number, number, number, number] {
  const s = css.trim()
  if (s.startsWith('#')) {
    const hex = s.slice(1)
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
      1,
    ]
  }
  const m = s.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const parts = m[1].split(',').map((p) => parseFloat(p.trim()))
    return [parts[0] | 0, parts[1] | 0, parts[2] | 0, parts.length > 3 ? parts[3] : 1]
  }
  return [255, 0, 255, 1] // unmistakable, so a colour bug is visible not silent
}

/**
 * The nine calls `src/art` and `src/engine/pixel` actually make, and nothing else.
 * Transforms are translate/scale only, which is all the game uses.
 */
class Raster {
  readonly w: number
  readonly h: number
  readonly px: Uint8ClampedArray
  fillStyle = '#000000'

  private st: CtxState
  private stack: CtxState[] = []
  private pending: Clip | null = null

  constructor(w: number, h: number) {
    this.w = w
    this.h = h
    this.px = new Uint8ClampedArray(w * h * 4)
    this.st = { tx: 0, ty: 0, sx: 1, sy: 1, clip: { x0: 0, y0: 0, x1: w, y1: h } }
  }

  save(): void {
    this.stack.push({ ...this.st, clip: { ...this.st.clip } })
  }

  restore(): void {
    const s = this.stack.pop()
    if (s) this.st = s
  }

  translate(x: number, y: number): void {
    this.st.tx += x * this.st.sx
    this.st.ty += y * this.st.sy
  }

  scale(x: number, y: number): void {
    this.st.sx *= x
    this.st.sy *= y
  }

  beginPath(): void {
    this.pending = null
  }

  rect(x: number, y: number, w: number, h: number): void {
    const x0 = this.st.tx + x * this.st.sx
    const y0 = this.st.ty + y * this.st.sy
    this.pending = { x0, y0, x1: x0 + w * this.st.sx, y1: y0 + h * this.st.sy }
  }

  clip(): void {
    if (!this.pending) return
    const c = this.st.clip
    const p = this.pending
    this.st.clip = {
      x0: Math.max(c.x0, p.x0),
      y0: Math.max(c.y0, p.y0),
      x1: Math.min(c.x1, p.x1),
      y1: Math.min(c.y1, p.y1),
    }
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const [r, g, b, a] = parseColor(this.fillStyle)
    if (a <= 0) return

    const c = this.st.clip
    const x0 = Math.max(Math.round(this.st.tx + x * this.st.sx), Math.round(c.x0), 0)
    const y0 = Math.max(Math.round(this.st.ty + y * this.st.sy), Math.round(c.y0), 0)
    const x1 = Math.min(
      Math.round(this.st.tx + (x + w) * this.st.sx),
      Math.round(c.x1),
      this.w,
    )
    const y1 = Math.min(
      Math.round(this.st.ty + (y + h) * this.st.sy),
      Math.round(c.y1),
      this.h,
    )

    for (let py = y0; py < y1; py += 1) {
      for (let pxi = x0; pxi < x1; pxi += 1) {
        const i = (py * this.w + pxi) * 4
        if (a >= 1) {
          this.px[i] = r
          this.px[i + 1] = g
          this.px[i + 2] = b
          this.px[i + 3] = 255
        } else {
          this.px[i] = this.px[i] * (1 - a) + r * a
          this.px[i + 1] = this.px[i + 1] * (1 - a) + g * a
          this.px[i + 2] = this.px[i + 2] * (1 - a) + b * a
          this.px[i + 3] = 255
        }
      }
    }
  }
}

/* ------------------------------------------------------------ png encoder */

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

interface Region {
  x: number
  y: number
  w: number
  h: number
}

/** Nearest-neighbour upscale of a sub-region, then a minimal RGBA PNG. */
function encodePng(src: Raster, scale: number, region: Region): Buffer {
  const w = region.w * scale
  const h = region.h * scale
  const raw = Buffer.alloc(h * (w * 4 + 1))

  for (let y = 0; y < h; y += 1) {
    const rowStart = y * (w * 4 + 1)
    raw[rowStart] = 0 // filter: none
    const sy = region.y + ((y / scale) | 0)
    for (let x = 0; x < w; x += 1) {
      const sx = region.x + ((x / scale) | 0)
      const s = (sy * src.w + sx) * 4
      const d = rowStart + 1 + x * 4
      raw[d] = src.px[s]
      raw[d + 1] = src.px[s + 1]
      raw[d + 2] = src.px[s + 2]
      raw[d + 3] = 255
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ------------------------------------------------------------ compositing */

type Ctx = CanvasRenderingContext2D

/** Draws the farm exactly as the world scene layers it: ground, overlays, plants, actors. */
function drawWorld(r: Raster, state: GameState, frame: number): void {
  const ctx = r as unknown as Ctx

  for (let y = 0; y < FARM_H; y += 1) {
    for (let x = 0; x < FARM_W; x += 1) {
      const tile = state.tiles[y * FARM_W + x]
      drawGround(ctx, tile, x * TILE, WORLD_Y + y * TILE, state.season, frame)
      drawTileOverlay(ctx, tile, x * TILE, WORLD_Y + y * TILE, frame)
    }
  }

  // Sorted by row so a plant or the farmer overlaps the tile above it correctly.
  for (let y = 0; y < FARM_H; y += 1) {
    for (let x = 0; x < FARM_W; x += 1) {
      const tile = state.tiles[y * FARM_W + x]
      if (tile.plant) {
        drawPlant(ctx, requireCrop(tile.plant.cropId), tile.plant, x * TILE, WORLD_Y + y * TILE, frame)
      }
    }
    if (state.player.y === y) {
      drawFarmer(ctx, state.player.facing, state.player.x * TILE, WORLD_Y + y * TILE, frame, state.tool)
    }
  }

  drawFarmhouse(ctx, TILE, WORLD_Y, state.season, state.minutes > 20 * 60)
  drawTree(ctx, 17 * TILE, WORLD_Y + 8 * TILE, state.season, 3)
  drawTree(ctx, 18 * TILE, WORLD_Y + 6 * TILE, state.season, 7)

  drawWeatherLayer(ctx, state.weather, frame)
  drawLightLayer(ctx, state.minutes, state.weather)
}

/**
 * Tills, sows and waters a patch, at a spread of growth stages, so the shot shows a
 * farm being worked rather than the untouched field a fresh save starts as.
 */
function worked(state: GameState): GameState {
  const spring = cropsForSeason('spring')
  const tiles = state.tiles.map((t) => ({ ...t }))

  for (let y = 3; y < 9; y += 1) {
    for (let x = 4; x < 13; x += 1) {
      const tile = tiles[y * FARM_W + x]
      if (tile.ground !== 'grass') continue

      const crop = spring[(x * 3 + y) % spring.length]
      tile.ground = 'soil'
      tile.watered = (x + y) % 4 !== 0
      tile.plant = {
        cropId: crop.id,
        stage: (x + y * 2) % (crop.stageDays.length + 1),
        progress: 0,
        dry: 0,
        dead: false,
        fertilized: false,
        regrown: 0,
      }
    }
  }
  return { ...state, tiles }
}

/* ------------------------------------------------------------------ tests */

describe.skipIf(process.env.SHOTS !== '1')('screenshot renderer', () => {
  it('renders real game frames to PNG', () => {
    fs.mkdirSync(OUT, { recursive: true })

    const scenes: Array<{ name: string; mutate: (s: GameState) => GameState }> = [
      { name: 'farm-spring-midday', mutate: (s) => worked({ ...s, minutes: 12 * 60 }) },
      { name: 'farm-evening', mutate: (s) => worked({ ...s, minutes: 19 * 60 }) },
      { name: 'farm-night', mutate: (s) => worked({ ...s, minutes: 23 * 60 }) },
      { name: 'farm-rain', mutate: (s) => worked({ ...s, minutes: 11 * 60, weather: 'rain' }) },
      {
        name: 'farm-winter',
        mutate: (s) => ({ ...s, minutes: 12 * 60, season: 'winter', weather: 'snow' }),
      },
    ]

    // The world band only — the HUD and belt are drawn by the scene layer, which
    // needs a live Input and UI, so cropping is honest where faking them would not be.
    const region: Region = { x: 0, y: WORLD_Y, w: FARM_W * TILE, h: FARM_H * TILE }

    for (const scene of scenes) {
      const state = scene.mutate(createState(20260817))
      const raster = new Raster(LOGICAL_W, LOGICAL_H)
      drawWorld(raster, state, 12)

      const png = encodePng(raster, 3, region)
      fs.writeFileSync(path.join(OUT, `${scene.name}.png`), png)

      // A frame that is one flat colour is a failed render wearing a filename.
      let min = 255
      let max = 0
      for (let i = 0; i < raster.px.length; i += 4) {
        if (raster.px[i] < min) min = raster.px[i]
        if (raster.px[i] > max) max = raster.px[i]
      }
      // eslint-disable-next-line no-console
      console.log(`${scene.name}: ${png.length}b red-range ${min}..${max}`)
      expect(max - min).toBeGreaterThan(20)
      expect(png.length).toBeGreaterThan(2000)
    }
  })
})
