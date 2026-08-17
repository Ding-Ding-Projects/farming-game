/**
 * A canvas stand-in for tests that need to know *where* the art layer painted rather
 * than what colour came out.
 *
 * `tests/shots.test.ts` rasterises for real because it writes PNGs. Nothing else needs
 * pixels: the questions here are "did anything land outside this rectangle?" and "did
 * two frames draw the same thing?", and both are answered from the fill calls alone.
 *
 * It implements the same nine 2D-context calls the art layer uses and nothing else, so
 * a drawing module that reaches for a tenth throws here instead of silently painting
 * somewhere this cannot see.
 */

export interface Box {
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
  clip: Box | null
}

/** The alpha of a fill style, so a fully transparent fill is not counted as paint. */
function alphaOf(css: string): number {
  const m = /rgba?\(([^)]+)\)/.exec(css.trim())
  if (m === null) return 1
  const parts = m[1].split(',')
  return parts.length > 3 ? parseFloat(parts[3]) : 1
}

export class Recorder {
  fillStyle = '#000000'

  /** Bounding box of every visible fill since the last `reset`. */
  bounds: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  /** Total painted area, so "nothing drew" is distinguishable from "drew a point". */
  area = 0
  /** Order-sensitive digest of every fill: colour, position and size. */
  digest = 2166136261

  private st: CtxState = { tx: 0, ty: 0, sx: 1, sy: 1, clip: null }
  private stack: CtxState[] = []
  private pending: Box | null = null

  reset(): void {
    this.bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
    this.area = 0
    this.digest = 2166136261
    this.st = { tx: 0, ty: 0, sx: 1, sy: 1, clip: null }
    this.stack = []
    this.pending = null
    this.fillStyle = '#000000'
  }

  save(): void {
    this.stack.push({ ...this.st })
  }

  restore(): void {
    const s = this.stack.pop()
    if (s !== undefined) this.st = s
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
    const p = this.pending
    if (p === null) return
    const c = this.st.clip
    this.st.clip =
      c === null
        ? { ...p }
        : {
            x0: Math.max(c.x0, p.x0),
            y0: Math.max(c.y0, p.y0),
            x1: Math.min(c.x1, p.x1),
            y1: Math.min(c.y1, p.y1),
          }
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    if (w <= 0 || h <= 0) return
    if (alphaOf(this.fillStyle) <= 0) return

    let x0 = this.st.tx + x * this.st.sx
    let y0 = this.st.ty + y * this.st.sy
    let x1 = x0 + w * this.st.sx
    let y1 = y0 + h * this.st.sy

    const c = this.st.clip
    if (c !== null) {
      x0 = Math.max(x0, c.x0)
      y0 = Math.max(y0, c.y0)
      x1 = Math.min(x1, c.x1)
      y1 = Math.min(y1, c.y1)
      if (x1 <= x0 || y1 <= y0) return
    }

    this.area += (x1 - x0) * (y1 - y0)
    if (x0 < this.bounds.x0) this.bounds.x0 = x0
    if (y0 < this.bounds.y0) this.bounds.y0 = y0
    if (x1 > this.bounds.x1) this.bounds.x1 = x1
    if (y1 > this.bounds.y1) this.bounds.y1 = y1

    this.mix(`${this.fillStyle}|${x0}|${y0}|${x1}|${y1}`)
  }

  /** FNV-1a over the fill, so two frames that drew the same thing hash the same. */
  private mix(s: string): void {
    let h = this.digest
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    this.digest = h >>> 0
  }
}

/** The recorder as the art layer's parameter type. It answers every call they make. */
export function recorderCtx(r: Recorder): CanvasRenderingContext2D {
  return r as unknown as CanvasRenderingContext2D
}
