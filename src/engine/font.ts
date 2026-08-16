/**
 * Sprout Hollow's typeface: a hand-authored 5x7 bitmap face.
 *
 * Every glyph is seven rows of five cells, `#` on and `.` off, rows joined by `/`.
 * Capitals and digits fill the whole seven-row cap band. Comma, semicolon and the
 * parenthesis pair are the only glyphs that drop below the baseline; they carry a
 * one-pixel descender applied at draw time (see `DESCENDERS`).
 *
 * The face is caps-led — lowercase input renders through the uppercase glyph.
 */

export const FONT_W = 5
export const FONT_H = 7

export interface TextOpts {
  /** Colour of a hard 1 px down-right shadow drawn under the text. Omit for none. */
  shadow?: string
  /** Pixels between glyph cells. Defaults to 1. */
  spacing?: number
  /** Clip the run to this many pixels from the left edge. */
  maxWidth?: number
}

/** Glyphs that hang one pixel below the cap baseline. */
const DESCENDERS = ',;()'

/** Drawn in place of any character the face does not carry, so gaps are visible. */
const UNKNOWN_SRC = '#####/#...#/#...#/#...#/#...#/#...#/#####'

const GLYPH_SRC: Readonly<Record<string, string>> = {
  ' ': '...../...../...../...../...../...../.....',
  '!': '..#../..#../..#../..#../..#../...../..#..',
  '"': '.#.#./.#.#./...../...../...../...../.....',
  '#': '.#.#./.#.#./#####/.#.#./#####/.#.#./.#.#.',
  $: '..#../.####/#.#../.###./..#.#/####./..#..',
  '%': '##.../##..#/...#./..#../.#.../#..##/...##',
  '&': '.##../#..#./#..#./.##../#.#.#/#..#./.##.#',
  "'": '..#../..#../...../...../...../...../.....',
  '(': '...#./..#../.#.../.#.../.#.../..#../...#.',
  ')': '.#.../..#../...#./...#./...#./..#../.#...',
  '*': '..#../#.#.#/.###./#.#.#/..#../...../.....',
  '+': '...../...../..#../#####/..#../...../.....',
  ',': '...../...../...../...../...../..##./.#...',
  '-': '...../...../...../.###./...../...../.....',
  '.': '...../...../...../...../...../...../..#..',
  '/': '....#/....#/...#./..#../.#.../#..../#....',

  '0': '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
  '1': '..#../.##../..#../..#../..#../..#../.###.',
  '2': '.###./#...#/....#/...#./..#../.#.../#####',
  '3': '#####/....#/...#./..##./....#/#...#/.###.',
  '4': '...#./..##./.#.#./#..#./#####/...#./...#.',
  '5': '#####/#..../####./....#/....#/#...#/.###.',
  '6': '..##./.#.../#..../####./#...#/#...#/.###.',
  '7': '#####/....#/...#./..#../..#../..#../..#..',
  '8': '.###./#...#/#...#/.###./#...#/#...#/.###.',
  '9': '.###./#...#/#...#/.####/....#/...#./.##..',

  // The semicolon's dot is authored one row high so the descender shift lands it on
  // the colon's upper dot; its tail then matches the comma exactly.
  ':': '...../...../..#../...../...../..#../.....',
  ';': '...../..#../...../...../...../..##./.#...',
  '<': '...../...#./..#../.#.../..#../...#./.....',
  '=': '...../...../#####/...../#####/...../.....',
  '>': '...../.#.../..#../...#./..#../.#.../.....',
  '?': '.###./#...#/....#/...#./..#../...../..#..',
  '@': '.###./#...#/#.###/#.#.#/#.###/#..../.####',

  A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
  B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.###./#...#/#..../#..../#..../#...#/.###.',
  D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../####./#..../#..../#####',
  F: '#####/#..../#..../####./#..../#..../#....',
  G: '.###./#...#/#..../#.###/#...#/#...#/.###.',
  H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '.###./..#../..#../..#../..#../..#../.###.',
  J: '..###/...#./...#./...#./...#./#..#./.##..',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#...#/#...#/#...#/#...#',
  N: '#...#/##..#/#.#.#/#.#.#/#..##/#...#/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.',
  T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#...#/#.#.#/##.##/#...#',
  X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
  Z: '#####/....#/...#./..#../.#.../#..../#####',

  '[': '.###./.#.../.#.../.#.../.#.../.#.../.###.',
  '\\': '#..../#..../.#.../..#../...#./....#/....#',
  ']': '.###./...#./...#./...#./...#./...#./.###.',
  '^': '..#../.#.#./#...#/...../...../...../.....',
  _: '...../...../...../...../...../...../#####',

  '`': '.#.../..#../...../...../...../...../.....',
  '{': '..##./.#.../.#.../##.../.#.../.#.../..##.',
  '|': '..#../..#../..#../..#../..#../..#../..#..',
  '}': '.##../...#./...#./...##/...#./...#./.##..',
  '~': '...../...../...../.##.#/#..#./...../.....',
}

interface Glyph {
  /** One bitmask per row; bit `c` is the pixel at column `c`, counted from the left. */
  readonly rows: readonly number[]
  /** Vertical offset in pixels — 1 for the four descending glyphs, 0 otherwise. */
  readonly dy: number
}

function parseGlyph(src: string, dy: number): Glyph {
  const lines = src.split('/')
  const rows: number[] = []
  for (let r = 0; r < FONT_H; r++) {
    const line = lines[r] ?? ''
    let bits = 0
    for (let c = 0; c < FONT_W; c++) {
      if (line.charAt(c) === '#') bits |= 1 << c
    }
    rows.push(bits)
  }
  return { rows, dy }
}

const GLYPHS = new Map<string, Glyph>()
for (const key of Object.keys(GLYPH_SRC)) {
  GLYPHS.set(key, parseGlyph(GLYPH_SRC[key] ?? '', DESCENDERS.includes(key) ? 1 : 0))
}

const UNKNOWN = parseGlyph(UNKNOWN_SRC, 0)
const BLANK = parseGlyph(GLYPH_SRC[' '] ?? '', 0)

function glyphFor(ch: string): Glyph {
  // Control characters and any other whitespace advance as a blank rather than
  // showing up as a missing-glyph box.
  if (ch.charCodeAt(0) <= 32) return BLANK
  return GLYPHS.get(ch) ?? GLYPHS.get(ch.toUpperCase()) ?? UNKNOWN
}

/** Exact pixel advance of a run, including inter-character spacing but no trailing gap. */
export function textWidth(text: string, spacing = 1): number {
  if (text.length === 0) return 0
  return text.length * FONT_W + (text.length - 1) * spacing
}

function paint(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  spacing: number,
  maxX: number,
): void {
  ctx.fillStyle = color
  let penX = x
  for (let i = 0; i < text.length; i++) {
    if (penX >= maxX) return
    const glyph = glyphFor(text.charAt(i))
    for (let r = 0; r < FONT_H; r++) {
      const bits = glyph.rows[r] ?? 0
      if (bits === 0) continue
      const py = y + r + glyph.dy
      for (let c = 0; c < FONT_W; c++) {
        if ((bits & (1 << c)) === 0) continue
        const px = penX + c
        if (px >= maxX) break
        ctx.fillRect(px, py, 1, 1)
      }
    }
    penX += FONT_W + spacing
  }
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  opts: TextOpts = {},
): void {
  if (text.length === 0) return
  const spacing = opts.spacing ?? 1
  const ox = Math.floor(x)
  const oy = Math.floor(y)
  const maxX = opts.maxWidth === undefined ? Infinity : ox + Math.floor(opts.maxWidth)
  if (maxX <= ox) return

  const previous = ctx.fillStyle
  if (opts.shadow !== undefined) paint(ctx, text, ox + 1, oy + 1, opts.shadow, spacing, maxX)
  paint(ctx, text, ox, oy, color, spacing, maxX)
  ctx.fillStyle = previous
}

/** Draws `text` horizontally centred on `cx`, snapped down to a whole pixel. */
export function drawTextCentered(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  color: string,
  opts: TextOpts = {},
): void {
  const w = textWidth(text, opts.spacing ?? 1)
  drawText(ctx, text, Math.floor(cx - w / 2), y, color, opts)
}

/** How many glyphs fit inside `maxWidth`, at least one so a hard break always advances. */
function charsThatFit(maxWidth: number, spacing: number): number {
  const cell = FONT_W + spacing
  return Math.max(1, Math.floor((maxWidth + spacing) / cell))
}

/** Greedy word wrap to a pixel width. Only over-long single words are broken. */
export function wrapText(text: string, maxWidth: number, spacing = 1): string[] {
  if (maxWidth <= 0) return []
  const lines: string[] = []

  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0)
    if (words.length === 0) {
      lines.push('')
      continue
    }

    let line = ''
    for (const word of words) {
      const joined = line === '' ? word : `${line} ${word}`
      if (textWidth(joined, spacing) <= maxWidth) {
        line = joined
        continue
      }
      if (line !== '') {
        lines.push(line)
        line = ''
      }
      let rest = word
      while (textWidth(rest, spacing) > maxWidth) {
        const n = charsThatFit(maxWidth, spacing)
        lines.push(rest.slice(0, n))
        rest = rest.slice(n)
      }
      line = rest
    }
    if (line !== '') lines.push(line)
  }

  // A run of nothing but whitespace should not produce a phantom blank line.
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}
