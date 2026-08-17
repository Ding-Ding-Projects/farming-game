import { PAL, shade } from './palette'
import type { Ramp } from './palette'

/**
 * Low-level drawing. Everything here lands on whole pixels of the 640x448 logical
 * framebuffer — incoming coordinates are rounded, never passed through, so nothing
 * can smear across a half pixel once the canvas is upscaled.
 *
 * These run hundreds of times a frame, so the primitives allocate nothing: no arrays,
 * no objects, no template strings in the hot path.
 */

export function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1)
}

export function rect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  const rw = Math.round(w)
  const rh = Math.round(h)
  if (rw <= 0 || rh <= 0) return
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), rw, rh)
}

export function hline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  color: string,
): void {
  const rw = Math.round(w)
  if (rw <= 0) return
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), rw, 1)
}

export function vline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  color: string,
): void {
  const rh = Math.round(h)
  if (rh <= 0) return
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), 1, rh)
}

/** A 1 px border on the outside of the given box. Corners included. */
export function outline(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  const rx = Math.round(x)
  const ry = Math.round(y)
  const rw = Math.round(w)
  const rh = Math.round(h)
  if (rw <= 0 || rh <= 0) return
  ctx.fillStyle = color
  if (rw <= 2 || rh <= 2) {
    ctx.fillRect(rx, ry, rw, rh)
    return
  }
  ctx.fillRect(rx, ry, rw, 1)
  ctx.fillRect(rx, ry + rh - 1, rw, 1)
  ctx.fillRect(rx, ry + 1, 1, rh - 2)
  ctx.fillRect(rx + rw - 1, ry + 1, 1, rh - 2)
}

/**
 * 50% checker fill. The pattern is anchored to the framebuffer, not to the box, so
 * two dithers that touch line up. `phase` shifts the checker by one cell.
 *
 * `cell` is the size of one square of the checker and defaults to 1 — the fine
 * pattern the 16 px art used, and still the right texture for a recess or a one-pixel
 * seam. At 32 px a large fill wants `cell = 2`: the same pattern doubled, which is
 * what keeps a big dithered area reading as texture instead of as grey.
 */
export function dither(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  phase = 0,
  cell = 1,
): void {
  const rx = Math.round(x)
  const ry = Math.round(y)
  const rw = Math.round(w)
  const rh = Math.round(h)
  if (rw <= 0 || rh <= 0) return
  const p = Math.round(phase)
  ctx.fillStyle = color

  const c = Math.round(cell) < 2 ? 1 : Math.round(cell)
  if (c === 1) {
    for (let row = 0; row < rh; row++) {
      const yy = ry + row
      // First column in this row whose (x + y + phase) sum is even.
      const start = (rx + yy + p) % 2 === 0 ? 0 : 1
      for (let col = start; col < rw; col += 2) {
        ctx.fillRect(rx + col, yy, 1, 1)
      }
    }
    return
  }

  // Coarse checker: whole cells, still anchored to the framebuffer, so a cell that the
  // box only partly covers is clipped rather than shifted. `& 1` reads parity correctly
  // for negative cell indices too, which a framebuffer-anchored grid does produce.
  const x1 = rx + rw
  const y1 = ry + rh
  const firstX = Math.floor(rx / c) * c
  for (let by = Math.floor(ry / c) * c; by < y1; by += c) {
    const cy = by / c
    const yy = by < ry ? ry : by
    const hh = (by + c < y1 ? by + c : y1) - yy
    for (let bx = firstX; bx < x1; bx += c) {
      if (((bx / c + cy + p) & 1) !== 0) continue
      const xx = bx < rx ? rx : bx
      ctx.fillRect(xx, yy, (bx + c < x1 ? bx + c : x1) - xx, hh)
    }
  }
}

/**
 * A filled ellipse centred on the pixel `cx, cy`, with radii `rx, ry`. Built from
 * integer scanlines — one `fillRect` per row, never `ctx.arc` — so the edge is a real
 * pixel staircase and the shape lands identically at every upscale.
 *
 * The radii are measured from the centre pixel outwards, so `rx = 0, ry = 0` is a
 * single pixel and `rx = 3` is seven pixels wide. Half a pixel is added to each radius
 * before the sweep, which is what stops the top and bottom rows coming to a point.
 *
 * This is the shape 32 px art needs constantly and 16 px art could not afford: a body,
 * a canopy, a puddle, a contact shadow under a sprite.
 */
export function ellipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
): void {
  const ox = Math.round(cx)
  const oy = Math.round(cy)
  const a = Math.round(rx)
  const b = Math.round(ry)
  if (a < 0 || b < 0) return
  ctx.fillStyle = color
  if (b === 0) {
    ctx.fillRect(ox - a, oy, a * 2 + 1, 1)
    return
  }
  const ae = a + 0.5
  const be = b + 0.5
  const aa = ae * ae
  const bb = be * be
  for (let dy = -b; dy <= b; dy++) {
    const k = 1 - (dy * dy) / bb
    const half = k <= 0 ? 0 : Math.floor(Math.sqrt(aa * k))
    ctx.fillRect(ox - half, oy + dy, half * 2 + 1, 1)
  }
}

/**
 * A body in its five-tone ramp, in one call: 1 px `ink` outline, a lit upper-left edge,
 * a dark lower-right side, the mid tone between them and a small cream specular where
 * the light lands. `docs/GRAPHICS.md` section 5.
 *
 * The outline stays one pixel wide on purpose. Doubling it is what a 16 px sprite scaled
 * to 32 looks like; a crisp single-pixel line around four tones of volume is what native
 * 32 px art looks like. Panel frames double (see `woodPanel`) — sprite outlines do not.
 *
 * Every lane calling this for its solid masses is what keeps the light consistent across
 * a screen drawn by six different hands.
 */
export function shadeRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  ramp: Ramp,
): void {
  const rx = Math.round(x)
  const ry = Math.round(y)
  const rw = Math.round(w)
  const rh = Math.round(h)
  if (rw <= 0 || rh <= 0) return
  if (rw < 3 || rh < 3) {
    // Too small to hold an outline and a body both; the mid tone alone reads better
    // than a box of pure outline.
    rect(ctx, rx, ry, rw, rh, ramp.mid)
    return
  }

  // Ink first, then the interior over it, so the ring is exactly one pixel everywhere.
  outline(ctx, rx, ry, rw, rh, ramp.ink)

  const ix = rx + 1
  const iy = ry + 1
  const iw = rw - 2
  const ih = rh - 2
  rect(ctx, ix, iy, iw, ih, ramp.mid)

  // Two-pixel edges once the body is big enough to show them, one pixel below that.
  const t = iw >= 8 && ih >= 8 ? 2 : 1

  // Away from the light: lower right.
  rect(ctx, ix, iy + ih - t, iw, t, ramp.dark)
  rect(ctx, ix + iw - t, iy, t, ih, ramp.dark)

  // Into the light: upper left, drawn second so it owns the shared corner.
  rect(ctx, ix, iy, iw, t, ramp.lit)
  rect(ctx, ix, iy, t, ih, ramp.lit)

  // The glint, sitting on the inner corner of the lit edge. Small — a few pixels at
  // 32 px, one pixel on anything little.
  const short = iw < ih ? iw : ih
  let s = (short / 10) | 0
  if (s < 1) s = 1
  else if (s > 3) s = 3
  if (s * 2 < short) rect(ctx, ix + t - 1, iy + t - 1, s, s, ramp.spec)
}

/** Bark lit from the upper left. Computed once — `shade` allocates. */
const PANEL_HIGHLIGHT = shade(PAL.grassLit, -0.3)

/**
 * The carved-wood panel of DESIGN.md section 6, at the doubled scale `docs/GRAPHICS.md`
 * section 8 calls for: hard 4 px shadow down-right, 2 px ink outline with corners
 * notched by two pixels, a 6 px bark frame (2 px when `thin`), a 2 px lit top and left
 * inner edge, parchment interior and a soil dither seating the bottom.
 *
 * `x, y, w, h` describe the panel including its outline; the shadow falls outside it.
 */
export function woodPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts?: { thin?: boolean },
): void {
  const rx = Math.round(x)
  const ry = Math.round(y)
  const rw = Math.round(w)
  const rh = Math.round(h)
  if (rw <= 0 || rh <= 0) return

  // Hard shadow, offset four down-right, corners notched two to match the panel.
  rect(ctx, rx + 4, ry + 6, rw, rh - 4, PAL.shadow)
  rect(ctx, rx + 6, ry + 4, rw - 4, 2, PAL.shadow)
  rect(ctx, rx + 6, ry + rh + 2, rw - 4, 2, PAL.shadow)

  // 2 px ink outline. Drawn as four runs so the 2x2 corner blocks stay unpainted —
  // that is the notch, and it lets the world show through the corner.
  rect(ctx, rx + 2, ry, rw - 4, 2, PAL.ink)
  rect(ctx, rx + 2, ry + rh - 2, rw - 4, 2, PAL.ink)
  rect(ctx, rx, ry + 2, 2, rh - 4, PAL.ink)
  rect(ctx, rx + rw - 2, ry + 2, 2, rh - 4, PAL.ink)

  // Bark frame: fill everything inside the outline, then lay the interior back over it.
  rect(ctx, rx + 2, ry + 2, rw - 4, rh - 4, PAL.bark)

  // Light falls from the upper left, always: top and left inner edges only.
  rect(ctx, rx + 2, ry + 2, rw - 4, 2, PANEL_HIGHLIGHT)
  rect(ctx, rx + 2, ry + 2, 2, rh - 4, PANEL_HIGHLIGHT)

  const frame = opts?.thin === true ? 2 : 6
  const border = frame + 2
  const iw = rw - border * 2
  const ih = rh - border * 2
  if (iw <= 0 || ih <= 0) return

  const ix = rx + border
  const iy = ry + border
  rect(ctx, ix, iy, iw, ih, PAL.parchment)
  // The old one-pixel seating dither, doubled: a 2 px checker in a 2 px band.
  dither(ctx, ix, iy + ih - 2, iw, 2, PAL.soil, 0, 2)
}

export type Sprite = { w: number; h: number; rows: string[]; palette: Record<string, string> }

/**
 * Build a sprite from rows of single-character palette keys. A space or `.` is
 * transparent. Ragged rows are a typo in the art, not a runtime condition, so they
 * throw here rather than drawing something subtly wrong for the rest of the project.
 */
export function makeSprite(rows: string[], palette: Record<string, string>): Sprite {
  const h = rows.length
  const w = h === 0 ? 0 : rows[0].length
  for (let r = 1; r < h; r++) {
    if (rows[r].length !== w) {
      throw new Error(
        `makeSprite: row ${r} is ${rows[r].length} characters, expected ${w} to match row 0`,
      )
    }
  }
  return { w, h, rows: rows.slice(), palette }
}

/**
 * Blit a sprite. Runs of one colour inside a row are merged into a single fill, which
 * is what keeps a screen full of 32x32 sprites cheap. Unknown keys draw nothing.
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
  flipX = false,
): void {
  const ox = Math.round(x)
  const oy = Math.round(y)
  const w = sprite.w
  const h = sprite.h
  if (w <= 0 || h <= 0) return
  const rows = sprite.rows
  const palette = sprite.palette

  for (let r = 0; r < h; r++) {
    const row = rows[r]
    const yy = oy + r
    let runColor = ''
    let runStart = 0
    // One extra step past the end flushes the final run.
    for (let c = 0; c <= w; c++) {
      let color = ''
      if (c < w) {
        const code = row.charCodeAt(c)
        if (code !== 32 /* space */ && code !== 46 /* . */) {
          const found = palette[row[c]]
          if (found !== undefined) color = found
        }
      }
      if (color === runColor) continue
      if (runColor !== '') {
        const len = c - runStart
        ctx.fillStyle = runColor
        ctx.fillRect(flipX ? ox + w - c : ox + runStart, yy, len, 1)
      }
      runColor = color
      runStart = c
    }
  }
}
