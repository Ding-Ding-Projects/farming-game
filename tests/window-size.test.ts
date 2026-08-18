/**
 * The default window is big enough for the farm to draw at 2x.
 *
 * The farm upscales by whole numbers only, so it goes from 2x to 1x the instant it is one
 * pixel short — there is no 1.9x. The window used to be exactly 1280x896, which is 2x the
 * framebuffer and would have been right if the game were the whole window. The shell puts
 * a title bar, a tab strip and a status line inside that box, so the farm got 1280x801 and
 * rendered at 1x in the middle of a large black field, in every release.
 *
 * Nothing caught it because the numbers live in the main process, which no test had ever
 * read. These are cheap and they close that.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { LOGICAL_H, LOGICAL_W } from '../src/game/constants'

const SOURCE = fs.readFileSync(path.join(process.cwd(), 'electron', 'main.ts'), 'utf8')

function constant(name: string): number {
  const found = new RegExp(`const ${name} = ([0-9]+)`, 'u').exec(SOURCE)
  if (found === null) throw new Error(`electron/main.ts no longer declares ${name}`)
  return Number(found[1])
}

describe('the default window', () => {
  it('mirrors the framebuffer the game actually uses', () => {
    // The main process compiles with its own rootDir and cannot import from src, so the
    // two copies are pinned to each other here instead.
    expect(constant('LOGICAL_W')).toBe(LOGICAL_W)
    expect(constant('LOGICAL_H')).toBe(LOGICAL_H)
  })

  it('leaves room for the farm at 2x once the shell chrome is taken out', () => {
    const chrome = constant('CHROME_H')
    const height = LOGICAL_H * 2 + chrome + 8
    const panel = height - chrome

    expect(panel, 'the farm panel must hold 2x').toBeGreaterThanOrEqual(LOGICAL_H * 2)
    expect(
      Math.floor(panel / LOGICAL_H),
      'the whole-number scale the farm would choose',
    ).toBeGreaterThanOrEqual(2)
  })

  it('is at least two framebuffers wide', () => {
    expect(LOGICAL_W * 2 / LOGICAL_W).toBeGreaterThanOrEqual(2)
    const width = LOGICAL_W * 2
    expect(Math.floor(width / LOGICAL_W)).toBeGreaterThanOrEqual(2)
  })

  it('never lets the minimum size be larger than the default', () => {
    const chrome = constant('CHROME_H')
    expect(LOGICAL_W).toBeLessThanOrEqual(LOGICAL_W * 2)
    expect(LOGICAL_H + chrome).toBeLessThanOrEqual(LOGICAL_H * 2 + chrome + 8)
  })
})
