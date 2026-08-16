/**
 * The dim-sum surprise.
 *
 * A small trolley — two steamer baskets, a teapot, and a plate of har gow, siu mai,
 * char siu bao, cheung fun and an egg tart — parked in the corner of the
 * application. It is **off by default** and turns on from one setting, from the
 * command palette, or from the toggle this module hands the settings tab.
 *
 * Three promises it keeps:
 *
 * - **It draws itself.** Every pixel here comes from the game's own primitives and
 *   the game's own fourteen-colour palette. There is no photograph, no icon font
 *   and no image file, so nothing has been invented from or copied off a public
 *   catalogue.
 * - **It never reaches the network.** Nothing here fetches anything, ever.
 * - **It never gets in the way.** The trolley is decorative: it cannot take focus,
 *   it cannot be clicked, it is hidden from assistive technology, it shrinks in a
 *   narrow window, it stops drawing when the window is in the background, and it
 *   holds perfectly still when reduced motion is asked for.
 */

import { PAL, shade, withAlpha } from '../../engine/palette'
import { dither, drawSprite, hline, makeSprite, px, rect, vline } from '../../engine/pixel'
import type { Sprite } from '../../engine/pixel'
import { onLangChange } from '../core/i18n'
import { registerCommand } from '../core/palette-registry'
import type { Command } from '../core/palette-registry'
import { get as storeGet, save as storeSave, subscribe as storeSubscribe } from '../core/store'
import {
  applyPaletteFallbacks,
  docText,
  ensureDocStyles,
  motionAllowed,
  registerDocStrings,
} from './almanac'

/**
 * Where the flag lives: the appearance map, keyed like any other element the
 * appearance system can edit. `hidden: false` means the trolley is out; no entry
 * at all — the shipped default — means it is not.
 */
export const SURPRISE_ELEMENT_ID = 'shell.surprise'

export const SURPRISE_STRINGS: Readonly<Record<string, string>> = {
  'surprise.panel.hint':
    'Drawn with the same primitives as the farm, at the same integer scale. Nothing here was photographed or downloaded.',
}

registerDocStrings(SURPRISE_STRINGS)

// ---------------------------------------------------------------------------
// the setting
// ---------------------------------------------------------------------------

const listeners = new Set<(on: boolean) => void>()
let lastKnown = false
let storeWatch: (() => void) | null = null

export function isSurpriseEnabled(): boolean {
  try {
    return storeGet().appearance[SURPRISE_ELEMENT_ID]?.hidden === false
  } catch {
    return false
  }
}

/** Persists the flag through the shell store — never through `localStorage`. */
export async function setSurpriseEnabled(on: boolean): Promise<void> {
  try {
    await storeSave({ appearance: { [SURPRISE_ELEMENT_ID]: { hidden: !on } } })
  } catch {
    // A store that refuses the write must not leave the UI lying about the state:
    // the listeners below are told what the store actually holds, not what was asked.
  }
  announceChange(isSurpriseEnabled())
}

/** Called when the flag changes, from anywhere. Returns an unsubscribe function. */
export function onSurpriseChange(fn: (on: boolean) => void): () => void {
  ensureStoreWatch()
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function announceChange(on: boolean): void {
  lastKnown = on
  for (const fn of Array.from(listeners)) fn(on)
}

function ensureStoreWatch(): void {
  if (storeWatch !== null) return
  try {
    lastKnown = isSurpriseEnabled()
    storeWatch = storeSubscribe(() => {
      const now = isSurpriseEnabled()
      if (now !== lastKnown) announceChange(now)
    })
  } catch {
    storeWatch = null
  }
}

/**
 * A ready-made control for the settings tab: a real checkbox with an accessible
 * name and a description tied to it. The settings lane owns the row it sits in.
 */
export function createSurpriseToggle(): HTMLElement {
  ensureDocStyles()

  const row = document.createElement('div')
  row.className = 'sh-doc__field'
  row.setAttribute('data-setting', SURPRISE_ELEMENT_ID)

  const label = document.createElement('label')
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.id = 'setting-surprise'
  input.checked = isSurpriseEnabled()
  const text = document.createElement('span')
  text.textContent = docText('surprise.enable')
  label.append(input, text)

  const description = document.createElement('p')
  description.id = 'setting-surprise-description'
  description.className = 'sh-doc__hint'
  description.textContent = docText('surprise.desc')
  input.setAttribute('aria-describedby', description.id)

  input.addEventListener('change', () => {
    void setSurpriseEnabled(input.checked)
  })

  // The row keeps itself in step with the store, and lets go of the subscription
  // the first time it is told about a change after being taken off the page.
  let off: (() => void) | null = null
  off = onSurpriseChange((on) => {
    if (!input.isConnected) {
      if (off !== null) off()
      return
    }
    input.checked = on
  })

  row.append(label, description)
  return row
}

let commandOff: (() => void) | null = null

/** Registers the palette command. Idempotent; safe to call from `app.ts`. */
export function registerSurpriseCommand(): () => void {
  if (commandOff !== null) return commandOff
  const command: Command = {
    id: 'surprise.toggle',
    titleKey: 'cmd.surprise',
    group: 'surprise',
    keywords: ['dim sum', 'dumpling', 'har gow', 'siu mai', 'tea', 'trolley', 'surprise'],
    run: () => {
      void setSurpriseEnabled(!isSurpriseEnabled())
    },
  }
  try {
    const off = registerCommand(command)
    commandOff = () => {
      off()
      commandOff = null
    }
    return commandOff
  } catch {
    return () => undefined
  }
}

// ---------------------------------------------------------------------------
// the art
// ---------------------------------------------------------------------------

/** Logical size of the scene. Everything below is in these coordinates. */
export const SCENE_W = 96
export const SCENE_H = 40

/** Device pixels per logical pixel inside the canvas. A whole number, always. */
const ART_SCALE = 2

const BAMBOO = shade(PAL.soil, 0.28)
const BAMBOO_DARK = shade(PAL.soil, -0.1)
const BAMBOO_LIT = shade(PAL.soil, 0.5)
const TABLE_LIT = shade(PAL.bark, 0.3)
const PORCELAIN = shade(PAL.sky, 0.35)
const PORCELAIN_DARK = shade(PAL.sky, -0.25)
const PLATE = shade(PAL.parchment, -0.15)
const CRUMB = shade(PAL.parchment, -0.3)

const HAR_GOW: Sprite = makeSprite(
  ['..ppp..', '.pprpp.', 'pprrrpp', '.ppppp.', '..sss..'],
  { p: shade(PAL.cream, -0.06), r: shade(PAL.berry, 0.45), s: CRUMB },
)

const SIU_MAI: Sprite = makeSprite(
  ['.wwwww.', 'wffrffw', 'wfffffw', 'wwwwwww', '.wwwww.', '..sss..'],
  { w: shade(PAL.lantern, -0.08), f: shade(PAL.bark, 0.22), r: PAL.berry, s: CRUMB },
)

const CHAR_SIU_BAO: Sprite = makeSprite(
  ['..bbbb..', '.bbrrbb.', 'bbbrrbbb', 'bbbbbbbb', '.bbbbbb.', '..ssss..'],
  { b: shade(PAL.cream, -0.02), r: shade(PAL.berry, -0.1), s: CRUMB },
)

const CHEUNG_FUN: Sprite = makeSprite(
  ['.rr.rr.rr.', 'rrrrrrrrrr', 'rrrrrrrrrr', '.dddddddd.', '..ssssss..'],
  { r: shade(PAL.parchment, 0.35), d: shade(PAL.bark, -0.2), s: CRUMB },
)

const EGG_TART: Sprite = makeSprite(
  ['.eeeee.', 'eccccce', 'eccccce', '.ppppp.', '..sss..'],
  {
    e: shade(PAL.lantern, -0.35),
    c: PAL.lantern,
    p: shade(PAL.soil, 0.2),
    s: CRUMB,
  },
)

const TEAPOT: Sprite = makeSprite(
  [
    '.....ll.....',
    '...tttttt...',
    '..tgttttttt.',
    's.tttttttt.h',
    'sstttttttthh',
    's.tttttttt.h',
    '..tttttttt..',
    '...tttttt...',
    '....bbbb....',
  ],
  {
    l: shade(PAL.sky, 0.5),
    t: PORCELAIN,
    g: PAL.cream,
    s: shade(PAL.sky, 0.1),
    h: PORCELAIN_DARK,
    b: PORCELAIN_DARK,
  },
)

/** One bamboo basket: a lit top rim, woven slats and a shadowed foot. */
function basket(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  rect(ctx, x, y, w, h, BAMBOO)
  hline(ctx, x, y, w, BAMBOO_LIT)
  hline(ctx, x, y + h - 1, w, BAMBOO_DARK)
  vline(ctx, x, y, h, BAMBOO_LIT)
  vline(ctx, x + w - 1, y, h, BAMBOO_DARK)
  // Slats on the anchored checker, so two stacked baskets line up.
  dither(ctx, x + 2, y + 2, w - 4, h - 4, BAMBOO_DARK)
  px(ctx, x, y, PAL.ink)
  px(ctx, x + w - 1, y, PAL.ink)
}

/** The domed lid, drawn as three narrowing courses with a knot on top. */
function lid(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, open: number): void {
  const oy = y - open
  rect(ctx, x, oy + 3, w, 2, BAMBOO)
  hline(ctx, x, oy + 3, w, BAMBOO_LIT)
  rect(ctx, x + 2, oy + 1, w - 4, 2, BAMBOO)
  hline(ctx, x + 2, oy + 1, w - 4, BAMBOO_LIT)
  hline(ctx, x + 5, oy, w - 10, BAMBOO_LIT)
  px(ctx, x + Math.floor(w / 2) - 1, oy - 1, BAMBOO_DARK)
  px(ctx, x + Math.floor(w / 2), oy - 1, BAMBOO_DARK)
}

/** A wisp: pixels that drift up and sideways on the slow sub-clock. */
function wisp(ctx: CanvasRenderingContext2D, x: number, baseY: number, beat: number, seed: number): void {
  for (let i = 0; i < 5; i++) {
    const life = (beat + seed + i * 2) % 12
    const y = baseY - life
    if (y < 0) continue
    const fade = 1 - life / 12
    if (fade <= 0.08) continue
    const sway = Math.round(Math.sin((life + seed) * 0.7) * 1.4)
    px(ctx, x + sway, y, withAlpha(PAL.cream, fade * 0.7))
  }
}

/**
 * Draws the whole scene at `beat`, the six-frames-a-second sub-clock the rest of
 * the game animates on. `beat` is held at 0 when motion is reduced, and the scene
 * is then drawn exactly once.
 */
export function drawDimSumScene(ctx: CanvasRenderingContext2D, beat: number): void {
  ctx.clearRect(0, 0, SCENE_W, SCENE_H)

  const floor = 34

  // The trolley top, lit from the upper left like every other surface.
  rect(ctx, 1, floor, SCENE_W - 2, 3, PAL.bark)
  hline(ctx, 1, floor, SCENE_W - 2, TABLE_LIT)
  hline(ctx, 2, floor + 3, SCENE_W - 4, PAL.shadow)
  for (const wheelX of [10, 84]) {
    px(ctx, wheelX, floor + 4, PAL.ink)
    px(ctx, wheelX + 1, floor + 4, PAL.ink)
  }

  // Teapot on the left.
  drawSprite(ctx, TEAPOT, 2, floor - 9)

  // Stacked steamers. The lid lifts a pixel every so often and lets a bigger
  // breath of steam out — the only movement in the whole flourish.
  const open = beat % 24 < 3 ? 1 : 0
  basket(ctx, 16, floor - 6, 24, 6)
  basket(ctx, 17, floor - 12, 22, 6)
  lid(ctx, 16, floor - 17, 24, open)

  // The plate, and what is on it.
  rect(ctx, 42, floor - 1, 52, 1, PLATE)
  hline(ctx, 43, floor - 2, 50, PAL.parchment)
  drawSprite(ctx, HAR_GOW, 43, floor - 7)
  drawSprite(ctx, SIU_MAI, 51, floor - 8)
  drawSprite(ctx, CHAR_SIU_BAO, 59, floor - 8)
  drawSprite(ctx, CHEUNG_FUN, 68, floor - 7)
  drawSprite(ctx, EGG_TART, 80, floor - 7)

  // Steam: two wisps off the lid, a third while it is open, one off the spout.
  const lidTop = floor - 18 - open
  wisp(ctx, 22, lidTop, beat, 0)
  wisp(ctx, 32, lidTop, beat, 5)
  if (open === 1) wisp(ctx, 27, lidTop, beat, 9)
  wisp(ctx, 3, floor - 10, Math.floor(beat / 2), 3)
}

// ---------------------------------------------------------------------------
// mounting
// ---------------------------------------------------------------------------

const STYLE_ID = 'sprout-surprise-styles'
const SURPRISE_CSS = `
.sh-surprise {
  --sp-scale: 2;
  width: calc(${SCENE_W} * var(--sp-scale) * 1px);
  height: calc(${SCENE_H} * var(--sp-scale) * 1px);
  image-rendering: pixelated;
  display: block;
}
.sh-surprise--corner {
  position: fixed;
  inset-block-end: 12px;
  inset-inline-start: 12px;
  z-index: 20;
  pointer-events: none;
}
.sh-surprise[hidden] { display: none; }
@media (max-width: 900px) { .sh-surprise--corner { --sp-scale: 1; } }
@media print { .sh-surprise--corner { display: none; } }
.sh-doc--surprise .sh-surprise { --sp-scale: 3; max-width: 100%; }
@media (max-width: 720px) { .sh-doc--surprise .sh-surprise { --sp-scale: 2; } }
`

function ensureSurpriseStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = SURPRISE_CSS
  const head = document.head ?? document.documentElement
  head.appendChild(style)
}

/** How long one beat of the shared six-frames-a-second sub-clock lasts. */
const BEAT_MS = 1000 / 6

export interface SurpriseHandle {
  el: HTMLCanvasElement
  /** Redraws and re-reads the setting. Called for you on every change. */
  sync(): void
  destroy(): void
}

interface SurpriseOptions {
  /**
   * `corner` is the opt-in flourish: fixed, decorative and gated on the setting.
   * `panel` is a canvas inside a surface the user opened on purpose, so it draws
   * whether or not the corner trolley is switched on.
   */
  mode?: 'corner' | 'panel'
}

/**
 * Mounts a trolley. It renders only while it is visible, only while the document
 * is in the foreground, and only while motion is allowed — otherwise it draws one
 * still frame and stops, which costs nothing at all.
 */
export function mountSurprise(host?: HTMLElement, options: SurpriseOptions = {}): SurpriseHandle {
  ensureSurpriseStyles()
  const mode = options.mode ?? 'corner'

  const canvas = document.createElement('canvas')
  canvas.className = mode === 'corner' ? 'sh-surprise sh-surprise--corner' : 'sh-surprise'
  canvas.width = SCENE_W * ART_SCALE
  canvas.height = SCENE_H * ART_SCALE
  // Decorative, unfocusable and unclickable, in that order of importance.
  canvas.setAttribute('aria-hidden', 'true')
  canvas.tabIndex = -1
  canvas.hidden = mode === 'corner'

  const parent = host ?? document.body ?? document.documentElement
  parent.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (ctx !== null) {
    ctx.imageSmoothingEnabled = false
    ctx.setTransform(ART_SCALE, 0, 0, ART_SCALE, 0, 0)
  }

  let raf = 0
  let startedAt = 0
  let lastBeat = -1

  function paint(beat: number): void {
    if (ctx === null || beat === lastBeat) return
    lastBeat = beat
    drawDimSumScene(ctx, beat)
  }

  function step(now: number): void {
    raf = 0
    if (startedAt === 0) startedAt = now
    paint(Math.floor((now - startedAt) / BEAT_MS))
    schedule()
  }

  function schedule(): void {
    if (raf !== 0 || typeof requestAnimationFrame !== 'function') return
    raf = requestAnimationFrame(step)
  }

  function stop(): void {
    if (raf === 0) return
    cancelAnimationFrame(raf)
    raf = 0
  }

  function sync(): void {
    const visible = mode === 'panel' || isSurpriseEnabled()
    canvas.hidden = !visible
    if (!visible) {
      stop()
      return
    }
    const backgrounded = typeof document !== 'undefined' && document.visibilityState === 'hidden'
    if (!motionAllowed() || backgrounded) {
      stop()
      lastBeat = -1
      paint(0)
      return
    }
    schedule()
  }

  const offSetting = onSurpriseChange(sync)
  document.addEventListener('visibilitychange', sync)

  let motionQuery: MediaQueryList | null = null
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
      motionQuery.addEventListener('change', sync)
    } catch {
      motionQuery = null
    }
  }

  sync()

  return {
    el: canvas,
    sync,
    destroy: () => {
      stop()
      offSetting()
      document.removeEventListener('visibilitychange', sync)
      if (motionQuery !== null) motionQuery.removeEventListener('change', sync)
      canvas.remove()
    },
  }
}

export interface SurprisePanel {
  el: HTMLElement
  destroy(): void
}

/**
 * The trolley as a panel, for a host that would rather give it a tab than a
 * corner. The canvas draws here regardless of the setting — the tab was opened on
 * purpose — and the same toggle governs the corner one.
 */
export function createSurprisePanel(): SurprisePanel {
  ensureDocStyles()
  ensureSurpriseStyles()

  const root = document.createElement('div')
  root.className = 'sh-doc sh-doc--surprise'
  root.setAttribute('data-doc', 'surprise')
  applyPaletteFallbacks(root)

  const heading = document.createElement('h2')
  const description = document.createElement('p')
  const hint = document.createElement('p')
  hint.className = 'sh-doc__hint'
  const toggle = createSurpriseToggle()

  root.append(heading, description, hint, toggle)
  const handle = mountSurprise(root, { mode: 'panel' })

  function relabel(): void {
    heading.textContent = docText('surprise.title')
    description.textContent = docText('surprise.desc')
    hint.textContent = docText('surprise.panel.hint')
  }

  relabel()
  const stopLang = onLangChange(relabel)

  return {
    el: root,
    destroy: () => {
      stopLang()
      handle.destroy()
      root.remove()
    },
  }
}

/**
 * Everything the shell needs in one call: the palette command and the corner
 * trolley. Returns a teardown that removes both.
 */
export function installSurprise(host?: HTMLElement): () => void {
  const offCommand = registerSurpriseCommand()
  const handle = mountSurprise(host)
  return () => {
    handle.destroy()
    offCommand()
  }
}
