import { PAL, shade } from './palette'

/**
 * Low-level drawing. Everything here lands on whole pixels of the 320x224 logical
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
 * two dithers that touch line up. `phase` shifts the checker by one pixel.
 */
export function dither(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  phase = 0,
): void {
  const rx = Math.round(x)
  const ry = Math.round(y)
  const rw = Math.round(w)
  const rh = Math.round(h)
  if (rw <= 0 || rh <= 0) return
  const p = Math.round(phase)
  ctx.fillStyle = color
  for (let row = 0; row < rh; row++) {
    const yy = ry + row
    // First column in this row whose (x + y + phase) sum is even.
    const start = (rx + yy + p) % 2 === 0 ? 0 : 1
    for (let col = start; col < rw; col += 2) {
      ctx.fillRect(rx + col, yy, 1, 1)
    }
  }
}

/** Bark lit from the upper left. Computed once — `shade` allocates. */
const PANEL_HIGHLIGHT = shade(PAL.grassLit, -0.3)

/**
 * The carved-wood panel of DESIGN.md section 6: hard 2 px shadow down-right, 1 px ink
 * outline with notched corners, a 3 px bark frame (1 px when `thin`), a lit top and
 * left inner edge, parchment interior and a soil dither seating the bottom.
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

  // Hard shadow, offset down-right, corners notched to match the panel.
  rect(ctx, rx + 2, ry + 3, rw, rh - 2, PAL.shadow)
  hline(ctx, rx + 3, ry + 2, rw - 2, PAL.shadow)
  hline(ctx, rx + 3, ry + rh + 1, rw - 2, PAL.shadow)

  // 1 px ink outline. Drawn as four runs so the four corner pixels stay unpainted —
  // that is the notch, and it lets the world show through the corner.
  hline(ctx, rx + 1, ry, rw - 2, PAL.ink)
  hline(ctx, rx + 1, ry + rh - 1, rw - 2, PAL.ink)
  vline(ctx, rx, ry + 1, rh - 2, PAL.ink)
  vline(ctx, rx + rw - 1, ry + 1, rh - 2, PAL.ink)

  // Bark frame: fill everything inside the outline, then lay the interior back over it.
  rect(ctx, rx + 1, ry + 1, rw - 2, rh - 2, PAL.bark)

  // Light falls from the upper left, always: top and left inner edges only.
  hline(ctx, rx + 1, ry + 1, rw - 2, PANEL_HIGHLIGHT)
  vline(ctx, rx + 1, ry + 1, rh - 2, PANEL_HIGHLIGHT)

  const frame = opts?.thin === true ? 1 : 3
  const border = frame + 1
  const iw = rw - border * 2
  const ih = rh - border * 2
  if (iw <= 0 || ih <= 0) return

  const ix = rx + border
  const iy = ry + border
  rect(ctx, ix, iy, iw, ih, PAL.parchment)
  dither(ctx, ix, iy + ih - 1, iw, 1, PAL.soil)
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
 * is what keeps a screen full of 16x16 sprites cheap. Unknown keys draw nothing.
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
