/**
 * The landing page's palette, guarded.
 *
 * `site/style.css` cannot import `src/engine/palette.ts`: the page is progressive
 * enhancement and has to be correct with scripting off, so its fourteen colours are
 * written as literal hex in a `:root` block. That is a duplication, and an unguarded
 * duplication drifts — the site would keep last year's green while the game moved on,
 * and nobody would notice until the screenshots stopped matching.
 *
 * So the duplication is allowed and checked. Every `--name` in that block that maps to a
 * palette entry must equal `PAL`'s value for it, and every palette entry must appear.
 * `docs/COMPLIANCE.md` records this as the one place outside `palette.ts` and
 * `tokens.css` where the shell's colours are written by hand.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { PAL } from '../src/engine/palette'
import type { PaletteName } from '../src/engine/palette'

const CSS = readFileSync(fileURLToPath(new URL('../site/style.css', import.meta.url)), 'utf8')

/** `--soil-wet` is `soilWet`. The site spells its custom properties in kebab case. */
function cssName(name: PaletteName): string {
  return `--${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
}

function declaredValue(property: string): string | null {
  const match = new RegExp(`${property}\\s*:\\s*([^;]+);`).exec(CSS)
  return match === null ? null : (match[1] as string).trim().toLowerCase()
}

describe('site/style.css carries the real palette', () => {
  it('declares every palette entry', () => {
    const missing = (Object.keys(PAL) as PaletteName[]).filter(
      (name) => declaredValue(cssName(name)) === null,
    )
    expect(missing, `palette entries the landing page never declares: ${missing.join(', ')}`).toEqual(
      [],
    )
  })

  it('matches src/engine/palette.ts exactly', () => {
    const drifted: string[] = []
    for (const name of Object.keys(PAL) as PaletteName[]) {
      const declared = declaredValue(cssName(name))
      if (declared === null) continue
      const expected = PAL[name].toLowerCase()
      if (declared !== expected) drifted.push(`${cssName(name)} is ${declared}, palette says ${expected}`)
    }
    expect(drifted, `the landing page has drifted from the palette:\n${drifted.join('\n')}`).toEqual(
      [],
    )
  })
})
