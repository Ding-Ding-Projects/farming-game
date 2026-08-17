/**
 * The software rasteriser every screenshot in this project is drawn through.
 *
 * Electron cannot be photographed in this environment: Win32 `PrintWindow` returns solid
 * black for Chromium, and on a GPU-less off-screen desktop the renderer never reaches
 * `dom-ready`. But the drawing code only ever touches nine 2D-context calls, so the honest
 * way out is to implement those nine, drive the *real* modules, and rasterise the result.
 *
 * Extracted from `shots.test.ts` so the world captures and the panel captures share one
 * implementation rather than two that can drift apart.
 */
import * as zlib from 'node:zlib'

/* ------------------------------------------------------------ tiny raster */

export interface Clip {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface CtxState {
  tx: number
  ty: number
  sx: number
  sy: number
  clip: Clip
}

/** Parses `#rrggbb`, `#rgb` and `rgba(r,g,b,a)`. Everything the art layer emits. */
export function parseColor(css: string): [number, number, number, number] {
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
 * The nine calls `src/art` and `src/engine/pixel` actually make, and nothing else:
 * `fillStyle`, `fillRect`, `save`, `restore`, `translate`, `scale`, `beginPath`,
 * `rect` and `clip`. Transforms are translate/scale only, which is all the game uses.
 *
 * If a drawing module ever reaches for a tenth call it will throw here as an
 * undefined function rather than silently drop pixels, which is the point.
 */
export class Raster {
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

export interface Region {
  x: number
  y: number
  w: number
  h: number
}

/** Nearest-neighbour upscale of a sub-region, then a minimal RGBA PNG. */
export function encodePng(src: Raster, scale: number, region: Region): Buffer {
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


/* ------------------------------------------------------------- assertions */

export interface Survey {
  /** Luminance range across the frame. */
  spread: number
  /** Distinct RGB triples. */
  colors: number
  /** Pixels nothing ever painted. */
  holes: number
}


export function survey(r: Raster, region: Region): Survey {
  const seen = new Set<number>()
  let min = 255
  let max = 0
  let holes = 0

  for (let y = region.y; y < region.y + region.h; y += 1) {
    for (let x = region.x; x < region.x + region.w; x += 1) {
      const i = (y * r.w + x) * 4
      const red = r.px[i]
      const green = r.px[i + 1]
      const blue = r.px[i + 2]
      const lum = (red * 3 + green * 6 + blue) / 10
      if (lum < min) min = lum
      if (lum > max) max = lum
      seen.add((red << 16) | (green << 8) | blue)
      if (r.px[i + 3] < 255) holes += 1
    }
  }
  return { spread: Math.round(max - min), colors: seen.size, holes }
}

