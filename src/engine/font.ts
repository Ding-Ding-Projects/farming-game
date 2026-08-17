/**
 * Sprout Hollow's type: two hand-authored bitmap faces, both drawn with `fillRect`
 * on integer coordinates. No web fonts, ever.
 *
 * - **Body — 7 x 9.** The primary face and the typographic identity of the game at
 *   640 x 448. Capitals fill the top eight rows, the baseline is row 7, and row 8 is
 *   a real descender row: the comma, the semicolon, the parenthesis pair, the `Q`
 *   tail, the `$` stem and the underscore all use it. Everything a glyph draws lives
 *   inside its nine-row cell, so a line of body text never bleeds into the next.
 * - **Small — 5 x 7.** The original face, kept for dense numeric readouts and tight
 *   belt labels where 7 x 9 will not fit. Selected per call with `TextOpts.small`.
 *
 * Every glyph in both faces is rows of `#` (on) and `.` (off) joined by `/`. Both are
 * caps-led: lowercase input renders through the uppercase glyph, and a character the
 * face does not carry renders as a hollow box so gaps are visible rather than silent.
 *
 * The site generator reads the two tables below by regex, so both must stay literal
 * `KEY: 'rows/joined/by/slash'` entries whose row strings contain only `.`, `#` and `/`.
 */

/** Body face — the default for `drawText`, `textWidth` and `wrapText`. */
export const FONT_W = 7
export const FONT_H = 9

/** Small face — opt in with `TextOpts.small`, or the `small` argument on the helpers. */
export const FONT_SMALL_W = 5
export const FONT_SMALL_H = 7

export interface TextOpts {
  /** Colour of a hard 1 px down-right shadow drawn under the text. Omit for none. */
  shadow?: string
  /** Pixels between glyph cells. Defaults to 1. */
  spacing?: number
  /** Clip the run to this many pixels from the left edge. */
  maxWidth?: number
  /** Set the run in the secondary 5 x 7 face instead of the 7 x 9 body face. */
  small?: boolean
}

/* ------------------------------------------------------------ small face 5x7 */

/**
 * Glyphs of the small face that hang one pixel below its baseline. The body face
 * needs no such list — its cell is nine rows and the descenders are authored in it.
 */
const SMALL_DESCENDERS = ',;()'

/** Drawn in place of any character the small face does not carry. */
const SMALL_UNKNOWN_SRC = '#####/#...#/#...#/#...#/#...#/#...#/#####'

const SMALL_GLYPH_SRC: Readonly<Record<string, string>> = {
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

/* ------------------------------------------------------------- body face 7x9 */

/** Drawn in place of any character the body face does not carry. */
const UNKNOWN_SRC =
  '#######/#.....#/#.....#/#.....#/#.....#/#.....#/#.....#/#######/.......'

/**
 * The body face. Rows 0-7 are the cap band with the baseline on row 7; row 8 is the
 * descender row. Light in this game falls from the upper left, so every stroke here is
 * a single flat pixel wide and the shading is left to `TextOpts.shadow`.
 */
const GLYPH_SRC: Readonly<Record<string, string>> = {
  ' ': '......./......./......./......./......./......./......./......./.......',
  '!': '...##../...##../...##../...##../...##../......./...##../...##../.......',
  '"': '.##.##./.##.##./......./......./......./......./......./......./.......',
  '#': '..#.#../..#.#../#######/..#.#../..#.#../#######/..#.#../..#.#../.......',
  $: '...#.../.#####./#..#..#/#..#.../.#####./...#..#/#..#..#/.#####./...#...',
  '%': '###...#/#.#..#./###.#../...#.../..#..../.#..###/#...#.#/....###/.......',
  '&': '..###../.#...#./.#...#./..###../.###.../#...#../#....#./.####.#/.......',
  "'": '...##../...##../......./......./......./......./......./......./.......',
  '(': '....#../...#.../..#..../..#..../..#..../..#..../..#..../...#.../....#..',
  ')': '..#..../...#.../....#../....#../....#../....#../....#../...#.../..#....',
  '*': '...#.../#..#..#/.#.#.#./..###../.#.#.#./#..#..#/...#.../......./.......',
  '+': '......./...#.../...#.../#######/...#.../...#.../......./......./.......',
  ',': '......./......./......./......./......./......./...##../...##../..##...',
  '-': '......./......./......./.#####./......./......./......./......./.......',
  '.': '......./......./......./......./......./......./...##../...##../.......',
  '/': '.....#./.....#./....#../...#.../..#..../.#...../#....../#....../.......',

  '0': '.#####./#.....#/#....##/#...#.#/#..#..#/#.#...#/##....#/.#####./.......',
  '1': '...#.../..##.../.#.#.../...#.../...#.../...#.../...#.../.#####./.......',
  '2': '.#####./#.....#/......#/.....#./...##../..#..../.#...../#######/.......',
  '3': '.#####./#.....#/......#/..#####/......#/......#/#.....#/.#####./.......',
  '4': '....##./...#.#./..#..#./.#...#./#....#./#######/.....#./.....#./.......',
  '5': '#######/#....../#....../######./......#/......#/#.....#/.#####./.......',
  '6': '..####./.#....#/#....../#....../######./#.....#/#.....#/.#####./.......',
  '7': '#######/.....#./....#../...#.../...#.../..#..../..#..../..#..../.......',
  '8': '.#####./#.....#/#.....#/.#####./#.....#/#.....#/#.....#/.#####./.......',
  '9': '.#####./#.....#/#.....#/.######/......#/......#/#....#./.####../.......',

  ':': '......./......./...##../...##../......./......./...##../...##../.......',
  ';': '......./......./...##../...##../......./......./...##../...##../..##...',
  '<': '.....#./....#../...#.../..#..../...#.../....#../.....#./......./.......',
  '=': '......./......./#######/......./#######/......./......./......./.......',
  '>': '.#...../..#..../...#.../....#../...#.../..#..../.#...../......./.......',
  '?': '.#####./#.....#/#.....#/....##./...##../......./...##../...##../.......',
  '@': '..###../.#...#./#.....#/#.###.#/#.#.#.#/#.#.#.#/#..##../.####../.......',

  A: '..###../.#...#./#.....#/#.....#/#######/#.....#/#.....#/#.....#/.......',
  B: '######./#.....#/#.....#/######./#.....#/#.....#/#.....#/######./.......',
  C: '..####./.#....#/#....../#....../#....../#....../.#....#/..####./.......',
  D: '#####../#....#./#.....#/#.....#/#.....#/#.....#/#....#./#####../.......',
  E: '#######/#....../#....../######./#....../#....../#....../#######/.......',
  F: '#######/#....../#....../######./#....../#....../#....../#....../.......',
  G: '..####./.#....#/#....../#....../#..####/#.....#/.#....#/..####./.......',
  H: '#.....#/#.....#/#.....#/#######/#.....#/#.....#/#.....#/#.....#/.......',
  I: '.#####./...#.../...#.../...#.../...#.../...#.../...#.../.#####./.......',
  J: '...####/.....#./.....#./.....#./.....#./.....#./#....#./.####../.......',
  K: '#....#./#...#../#..#.../#.#..../##...../#.#..../#..#.../#...#../.......',
  L: '#....../#....../#....../#....../#....../#....../#....../#######/.......',
  M: '#.....#/##...##/#.#.#.#/#..#..#/#.....#/#.....#/#.....#/#.....#/.......',
  N: '#.....#/##....#/#.#...#/#..#..#/#...#.#/#....##/#.....#/#.....#/.......',
  O: '.#####./#.....#/#.....#/#.....#/#.....#/#.....#/#.....#/.#####./.......',
  P: '######./#.....#/#.....#/#.....#/######./#....../#....../#....../.......',
  Q: '.#####./#.....#/#.....#/#.....#/#.....#/#..#..#/#...#.#/.#####./.....##',
  R: '######./#.....#/#.....#/#.....#/######./#...#../#....#./#.....#/.......',
  S: '.#####./#.....#/#....../.#####./......#/......#/#.....#/.#####./.......',
  T: '#######/...#.../...#.../...#.../...#.../...#.../...#.../...#.../.......',
  U: '#.....#/#.....#/#.....#/#.....#/#.....#/#.....#/#.....#/.#####./.......',
  V: '#.....#/#.....#/#.....#/#.....#/.#...#./.#...#./..#.#../...#.../.......',
  W: '#.....#/#.....#/#.....#/#.....#/#..#..#/#.#.#.#/##...##/#.....#/.......',
  X: '#.....#/.#...#./..#.#../...#.../...#.../..#.#../.#...#./#.....#/.......',
  Y: '#.....#/.#...#./..#.#../...#.../...#.../...#.../...#.../...#.../.......',
  Z: '#######/.....#./....#../...#.../..#..../.#...../#....../#######/.......',

  '[': '..####./..#..../..#..../..#..../..#..../..#..../..#..../..####./.......',
  '\\': '#....../#....../.#...../..#..../...#.../....#../.....#./.....#./.......',
  ']': '.####../....#../....#../....#../....#../....#../....#../.####../.......',
  '^': '...#.../..#.#../.#...#./#.....#/......./......./......./......./.......',
  _: '......./......./......./......./......./......./......./......./#######',

  '`': '..#..../...#.../......./......./......./......./......./......./.......',
  '{': '....##./...#.../...#.../...#.../..#..../...#.../...#.../...#.../....##.',
  '|': '...#.../...#.../...#.../...#.../...#.../...#.../...#.../...#.../...#...',
  '}': '.##..../...#.../...#.../...#.../....#../...#.../...#.../...#.../.##....',
  '~': '......./......./......./.##...#/#..###./......./......./......./.......',
}

/* --------------------------------------------------------------- face plumbing */

interface Glyph {
  /** One bitmask per row; bit `c` is the pixel at column `c`, counted from the left. */
  readonly rows: readonly number[]
  /** Vertical offset in pixels — used by the small face's four descending glyphs. */
  readonly dy: number
}

interface Face {
  readonly w: number
  readonly h: number
  readonly glyphs: ReadonlyMap<string, Glyph>
  readonly unknown: Glyph
  readonly blank: Glyph
}

function parseGlyph(src: string, w: number, h: number, dy: number): Glyph {
  const lines = src.split('/')
  const rows: number[] = []
  for (let r = 0; r < h; r++) {
    const line = lines[r] ?? ''
    let bits = 0
    for (let c = 0; c < w; c++) {
      if (line.charAt(c) === '#') bits |= 1 << c
    }
    rows.push(bits)
  }
  return { rows, dy }
}

function buildFace(
  src: Readonly<Record<string, string>>,
  w: number,
  h: number,
  unknownSrc: string,
  descenders: string,
): Face {
  const glyphs = new Map<string, Glyph>()
  for (const key of Object.keys(src)) {
    glyphs.set(key, parseGlyph(src[key] ?? '', w, h, descenders.includes(key) ? 1 : 0))
  }
  return {
    w,
    h,
    glyphs,
    unknown: parseGlyph(unknownSrc, w, h, 0),
    blank: parseGlyph(src[' '] ?? '', w, h, 0),
  }
}

const BODY_FACE = buildFace(GLYPH_SRC, FONT_W, FONT_H, UNKNOWN_SRC, '')
const SMALL_FACE = buildFace(
  SMALL_GLYPH_SRC,
  FONT_SMALL_W,
  FONT_SMALL_H,
  SMALL_UNKNOWN_SRC,
  SMALL_DESCENDERS,
)

function faceFor(small: boolean | undefined): Face {
  return small === true ? SMALL_FACE : BODY_FACE
}

function glyphFor(face: Face, ch: string): Glyph {
  // Control characters and any other whitespace advance as a blank rather than
  // showing up as a missing-glyph box.
  if (ch.charCodeAt(0) <= 32) return face.blank
  return face.glyphs.get(ch) ?? face.glyphs.get(ch.toUpperCase()) ?? face.unknown
}

/* ---------------------------------------------------------------------- public */

/**
 * Exact pixel advance of a run, including inter-character spacing but no trailing gap.
 * Pass `small` to measure in the 5 x 7 face, matching `TextOpts.small`.
 */
export function textWidth(text: string, spacing = 1, small = false): number {
  if (text.length === 0) return 0
  const w = small ? FONT_SMALL_W : FONT_W
  return text.length * w + (text.length - 1) * spacing
}

function paint(
  ctx: CanvasRenderingContext2D,
  face: Face,
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
    const glyph = glyphFor(face, text.charAt(i))
    for (let r = 0; r < face.h; r++) {
      const bits = glyph.rows[r] ?? 0
      if (bits === 0) continue
      const py = y + r + glyph.dy
      for (let c = 0; c < face.w; c++) {
        if ((bits & (1 << c)) === 0) continue
        const px = penX + c
        if (px >= maxX) break
        ctx.fillRect(px, py, 1, 1)
      }
    }
    penX += face.w + spacing
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
  const face = faceFor(opts.small)
  const spacing = opts.spacing ?? 1
  const ox = Math.floor(x)
  const oy = Math.floor(y)
  const maxX = opts.maxWidth === undefined ? Infinity : ox + Math.floor(opts.maxWidth)
  if (maxX <= ox) return

  const previous = ctx.fillStyle
  if (opts.shadow !== undefined) {
    paint(ctx, face, text, ox + 1, oy + 1, opts.shadow, spacing, maxX)
  }
  paint(ctx, face, text, ox, oy, color, spacing, maxX)
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
  const w = textWidth(text, opts.spacing ?? 1, opts.small ?? false)
  drawText(ctx, text, Math.floor(cx - w / 2), y, color, opts)
}

/** How many glyphs fit inside `maxWidth`, at least one so a hard break always advances. */
function charsThatFit(maxWidth: number, spacing: number, cellW: number): number {
  const cell = cellW + spacing
  return Math.max(1, Math.floor((maxWidth + spacing) / cell))
}

/**
 * Greedy word wrap to a pixel width. Only over-long single words are broken.
 * Pass `small` to wrap for the 5 x 7 face, matching `TextOpts.small`.
 */
export function wrapText(text: string, maxWidth: number, spacing = 1, small = false): string[] {
  if (maxWidth <= 0) return []
  const cellW = small ? FONT_SMALL_W : FONT_W
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
      if (textWidth(joined, spacing, small) <= maxWidth) {
        line = joined
        continue
      }
      if (line !== '') {
        lines.push(line)
        line = ''
      }
      let rest = word
      while (textWidth(rest, spacing, small) > maxWidth) {
        const n = charsThatFit(maxWidth, spacing, cellW)
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
