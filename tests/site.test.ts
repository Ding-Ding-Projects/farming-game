/**
 * The two things the landing page reads out of the game and cannot check for itself.
 *
 * 1. **The glyph tables.** `site/` sets its wordmark and its specimen cards in the game's
 *    own face by parsing `src/engine/font.ts` — it looks for entries of the literal form
 *    `KEY: 'rows/joined/by/slash'`. A face rewritten as anything else (a computed table, a
 *    template string, rows in an array) still compiles, still renders in the game, and
 *    silently empties the landing page. So the *shape* of the source is a contract.
 *
 * 2. **The screenshots.** `site/shots/` is a committed copy of the frames
 *    `tests/shots.test.ts` renders into `docs/shots/`, and `site/index.html` hard-codes
 *    their pixel size in `width`/`height` so the page does not reflow while they load.
 *    Both went stale when the framebuffer doubled: the page shipped 960 x 528 frames of
 *    16 px art long after the game had moved to 32 px. Checked here so it cannot recur.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { FONT_H, FONT_SMALL_H, FONT_SMALL_W, FONT_W } from '../src/engine/font'
import { FARM_W, TILE, WORLD_H } from '../src/game/constants'

const here = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url))

const FONT_SRC = readFileSync(here('../src/engine/font.ts'), 'utf8')
const INDEX_HTML = readFileSync(here('../site/index.html'), 'utf8')

/**
 * The generator's own pattern: a key, a colon, and a single-quoted string of nothing but
 * `.`, `#` and `/`. The key may be bare (`A`, `$`, `_`) or quoted (`':'`, `'\\'`).
 */
const GLYPH_ENTRY = /^[ \t]*(?:'((?:[^'\\]|\\.)*)'|"([^"]*)"|([A-Za-z0-9_$]+))\s*:\s*'([.#/]+)',?\s*$/gm

interface Entry {
  key: string
  rows: string[]
}

function entriesIn(source: string): Entry[] {
  const found: Entry[] = []
  const re = new RegExp(GLYPH_ENTRY.source, 'gm')
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    found.push({ key: m[1] ?? m[2] ?? m[3], rows: m[4].split('/') })
  }
  return found
}

/** The two tables, split at the point the body face is declared. */
const bodyAt = FONT_SRC.indexOf('const GLYPH_SRC')
const smallAt = FONT_SRC.indexOf('const SMALL_GLYPH_SRC')
const smallEntries = entriesIn(FONT_SRC.slice(smallAt, bodyAt))
const bodyEntries = entriesIn(FONT_SRC.slice(bodyAt))

describe("the wordmark generator's view of font.ts", () => {
  it('finds both tables', () => {
    expect(smallAt, 'SMALL_GLYPH_SRC is gone').toBeGreaterThanOrEqual(0)
    expect(bodyAt, 'GLYPH_SRC is gone').toBeGreaterThan(smallAt)
    expect(smallEntries.length, 'the small face parsed as nothing').toBeGreaterThan(64)
    expect(bodyEntries.length, 'the body face parsed as nothing').toBeGreaterThan(64)
  })

  it('carries the same characters in both faces', () => {
    const small = smallEntries.map((e) => e.key).sort()
    const body = bodyEntries.map((e) => e.key).sort()
    expect(body).toEqual(small)
  })

  it('sets every row of the body face at exactly FONT_W x FONT_H', () => {
    const wrong = bodyEntries
      .filter((e) => e.rows.length !== FONT_H || e.rows.some((r) => r.length !== FONT_W))
      .map((e) => `${e.key} is ${e.rows[0]?.length ?? 0}x${e.rows.length}`)
    expect(wrong, `body glyphs that are not ${FONT_W}x${FONT_H}:\n${wrong.join('\n')}`).toEqual([])
  })

  it('sets every row of the small face at exactly FONT_SMALL_W x FONT_SMALL_H', () => {
    const wrong = smallEntries
      .filter((e) => e.rows.length !== FONT_SMALL_H || e.rows.some((r) => r.length !== FONT_SMALL_W))
      .map((e) => `${e.key} is ${e.rows[0]?.length ?? 0}x${e.rows.length}`)
    expect(
      wrong,
      `small glyphs that are not ${FONT_SMALL_W}x${FONT_SMALL_H}:\n${wrong.join('\n')}`,
    ).toEqual([])
  })

  it('carries the letters, the digits and a space, which is all the wordmark needs', () => {
    const keys = new Set(bodyEntries.map((e) => e.key))
    for (const ch of 'SPROUTHOLLOW0123456789') expect(keys.has(ch), `body face lost ${ch}`).toBe(true)
    expect(keys.has(' '), 'body face lost the space').toBe(true)
  })
})

/* ------------------------------------------------------------------ shots */

/** Width and height out of a PNG's IHDR, which is always the first chunk. */
function pngSize(file: string): { w: number; h: number } {
  const bytes = readFileSync(file)
  return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) }
}

/** `tests/shots.test.ts` crops to the world band and upscales by two. */
const SHOT_W = FARM_W * TILE * 2
const SHOT_H = WORLD_H * 2

const ON_THE_PAGE = ['farm-spring-midday', 'farm-evening', 'farm-winter']

describe('the screenshots the landing page ships', () => {
  it('are the current framebuffer, not a frame from before it doubled', () => {
    for (const name of ON_THE_PAGE) {
      const size = pngSize(here(`../site/shots/${name}.png`))
      expect(
        `${name} ${size.w}x${size.h}`,
        `site/shots/${name}.png is stale - re-run SHOTS=1 and copy docs/shots across`,
      ).toBe(`${name} ${SHOT_W}x${SHOT_H}`)
    }
  })

  it('match what index.html reserves space for', () => {
    for (const name of ON_THE_PAGE) {
      const img = new RegExp(`<img[^>]*src="\\./shots/${name}\\.png"[^>]*>`, 's').exec(INDEX_HTML)
      expect(img, `index.html no longer shows ${name}.png`).not.toBeNull()
      const tag = img?.[0] ?? ''
      expect(tag, `${name} width attribute`).toContain(`width="${SHOT_W}"`)
      expect(tag, `${name} height attribute`).toContain(`height="${SHOT_H}"`)
    }
  })
})
