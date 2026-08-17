#!/usr/bin/env node
/**
 * Draws the application mark and writes `build/icon.ico`.
 *
 * This project has no image files in it, on purpose: every sprite, tile, particle and
 * letter in the game is drawn from code. An application icon is the one thing a packaged
 * Windows build genuinely cannot do without — a build with no icon ships the Electron
 * default, which is somebody else's mark on our installer.
 *
 * So the icon is drawn from code too, and what is committed is this generator rather than
 * a `.ico`. That keeps both rules true at once: the repository still holds no asset file,
 * and the packaged executable still carries an original mark. `build/` is ignored; the
 * icon is produced before packaging and is reproducible from this file alone.
 *
 * The mark is the game's own subject at the game's own resolution: a seedling standing in
 * a hollow, lit from the upper left like every other pixel this project draws, in the
 * palette of `DESIGN.md`. It is authored at 16, 32, 48, 64, 128 and 256 so that the small
 * sizes are *drawn* small rather than resampled — a 256 icon squeezed into a 16 px taskbar
 * slot turns into mud, which is exactly where an icon is seen most.
 *
 * No dependencies: the PNGs are encoded with `zlib` and wrapped in an ICO container here.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as zlib from 'node:zlib'

/* ------------------------------------------------------------------ palette */

// The DESIGN.md palette, by hand, because this script must not import the renderer.
const INK = [0x1b, 0x1a, 0x24]
const SHADOW = [0x2f, 0x2b, 0x3d]
const BARK = [0x4a, 0x3a, 0x34]
const SOIL = [0x6b, 0x4a, 0x34]
const SOIL_WET = [0x43, 0x29, 0x1f]
const GRASS = [0x4f, 0x7a, 0x3a]
const GRASS_LIT = [0x6d, 0x9c, 0x46]
const LEAF = [0x2f, 0x5c, 0x33]
const CREAM = [0xf6, 0xef, 0xd8]
const LANTERN = [0xf2, 0xa5, 0x41]

/* ------------------------------------------------------------------ canvas */

class Bitmap {
  constructor(size) {
    this.size = size
    this.px = new Uint8ClampedArray(size * size * 4)
  }

  set(x, y, rgb, alpha = 255) {
    const s = this.size
    const ix = Math.round(x)
    const iy = Math.round(y)
    if (ix < 0 || iy < 0 || ix >= s || iy >= s) return
    const i = (iy * s + ix) * 4
    this.px[i] = rgb[0]
    this.px[i + 1] = rgb[1]
    this.px[i + 2] = rgb[2]
    this.px[i + 3] = alpha
  }

  rect(x, y, w, h, rgb, alpha = 255) {
    for (let dy = 0; dy < h; dy += 1) {
      for (let dx = 0; dx < w; dx += 1) this.set(x + dx, y + dy, rgb, alpha)
    }
  }

  /** A filled ellipse, stepped per row so it stays hard-edged. No anti-aliasing, ever. */
  ellipse(cx, cy, rx, ry, rgb) {
    for (let dy = -ry; dy <= ry; dy += 1) {
      const t = ry === 0 ? 0 : dy / ry
      const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - t * t)))
      for (let dx = -half; dx <= half; dx += 1) this.set(cx + dx, cy + dy, rgb)
    }
  }
}

/* -------------------------------------------------------------------- mark */

/**
 * The mark, drawn in proportion to `size`.
 *
 * Everything is placed on a 16-unit grid and multiplied up, so every size is the same
 * drawing rather than six different ones, and every edge still lands on a whole pixel.
 */
function drawMark(size) {
  const b = new Bitmap(size)
  const u = size / 16
  const px = (n) => Math.round(n * u)

  // The hollow: a dark rounded field with a lit rim up and left, so the mark reads as a
  // dished valley rather than a flat tile.
  b.rect(0, 0, size, size, INK)
  b.ellipse(px(8), px(9), px(7.4), px(6.6), SHADOW)
  b.ellipse(px(8), px(9), px(6.6), px(5.8), SOIL_WET)
  b.ellipse(px(7.6), px(8.4), px(5.6), px(4.6), SOIL)

  // The ground line the seedling stands on, and the two banks of the hollow.
  b.ellipse(px(8), px(11.2), px(6.2), px(2.4), GRASS)
  b.ellipse(px(7.6), px(10.8), px(5.4), px(1.8), GRASS_LIT)

  // The stem. Two units wide at the smallest size so it survives a 16 px taskbar slot.
  const stemW = Math.max(1, px(1))
  const stemX = px(8) - Math.floor(stemW / 2)
  b.rect(stemX, px(5.5), stemW, px(5.5), LEAF)
  b.rect(stemX, px(5.5), Math.max(1, Math.floor(stemW / 2)), px(5.5), GRASS)

  // Two leaves, the left one lit and the right one in shade — light from the upper left.
  // Kept short enough to stay inside the rim: a leaf that breaks the ring turns the mark
  // into a blob at 16 px, which is the size that matters most.
  leaf(b, px(8) - px(0.6), px(6.8), -1, u, GRASS_LIT, LEAF)
  leaf(b, px(8) + px(0.6), px(7.8), 1, u, GRASS, LEAF)

  // The seed head, and the one cream glint every struck thing in this game carries.
  b.ellipse(px(8), px(4.6), Math.max(1, px(1.5)), Math.max(1, px(1.3)), LANTERN)
  if (size >= 32) {
    b.ellipse(px(7.6), px(4.2), Math.max(1, px(0.7)), Math.max(1, px(0.6)), CREAM)
  } else {
    b.set(px(7.5), px(4.2), CREAM)
  }

  // A hard one-pixel ink ring, so the mark holds its shape on a light taskbar as well as
  // a dark one. Drawn last, over everything.
  ring(b, px(8), px(9), px(7.4), px(6.6))
  return b
}

/**
 * One leaf: a blade that swells away from the stem and comes back to a point, curving
 * gently *downward* the way a real seedling's first leaves hang, rather than the straight
 * upward wedge that reads as an arrow.
 */
function leaf(b, x0, y0, dir, u, top, under) {
  const span = Math.max(2, Math.round(3.4 * u))
  for (let i = 0; i < span; i += 1) {
    const t = i / span
    // Thickest a third of the way out, tapering to a single pixel at the tip.
    const swell = Math.sin(Math.min(1, t * 1.15) * Math.PI)
    const h = Math.max(1, Math.round(swell * 2.1 * u))
    const x = x0 + dir * i
    // Rises a little, then droops — the curve is what makes it read as a leaf.
    const y = y0 - Math.round(Math.sin(t * Math.PI * 0.85) * 1.5 * u) + Math.round(t * t * 1.1 * u)
    for (let dy = 0; dy < h; dy += 1) b.set(x, y + dy, top)
    b.set(x, y + h, under)
    // The midrib, once there is room for one.
    if (u >= 2 && h >= 3) b.set(x, y + Math.floor(h / 2), under)
  }
}

/** The outer ink ring of the hollow, one pixel thick. */
function ring(b, cx, cy, rx, ry) {
  for (let a = 0; a < 512; a += 1) {
    const th = (a / 512) * Math.PI * 2
    b.set(cx + Math.round(Math.cos(th) * rx), cy + Math.round(Math.sin(th) * ry), INK)
  }
}

/* ------------------------------------------------------------- png encoding */

const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(bitmap) {
  const s = bitmap.size
  const raw = Buffer.alloc((s * 4 + 1) * s)
  for (let y = 0; y < s; y += 1) {
    raw[y * (s * 4 + 1)] = 0
    for (let x = 0; x < s * 4; x += 1) raw[y * (s * 4 + 1) + 1 + x] = bitmap.px[y * s * 4 + x]
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(s, 0)
  ihdr.writeUInt32BE(s, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ------------------------------------------------------------- ico container */

/**
 * A PNG-compressed ICO. Every size from Vista onward reads embedded PNG, and a 256 entry
 * has to be PNG because the BMP form cannot express it.
 */
function encodeIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  const entries = []
  const bodies = []
  let offset = 6 + images.length * 16

  for (const { size, png } of images) {
    const e = Buffer.alloc(16)
    e[0] = size >= 256 ? 0 : size
    e[1] = size >= 256 ? 0 : size
    e[2] = 0
    e[3] = 0
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(offset, 12)
    entries.push(e)
    bodies.push(png)
    offset += png.length
  }
  return Buffer.concat([header, ...entries, ...bodies])
}

/* -------------------------------------------------------------------- main */

const SIZES = [16, 24, 32, 48, 64, 128, 256]
const out = path.join(process.cwd(), 'build')
fs.mkdirSync(out, { recursive: true })

const images = SIZES.map((size) => ({ size, png: encodePng(drawMark(size)) }))
const ico = encodeIco(images)
fs.writeFileSync(path.join(out, 'icon.ico'), ico)

// A single 256 PNG as well: Squirrel's installer loading image and the Linux/dev window
// icon both want a plain raster, and generating it here keeps the two in step.
fs.writeFileSync(path.join(out, 'icon.png'), images[images.length - 1].png)

console.log(
  `build/icon.ico  ${ico.length} bytes, ${SIZES.length} sizes (${SIZES.join(', ')})\n` +
    `build/icon.png  ${images[images.length - 1].png.length} bytes`,
)
