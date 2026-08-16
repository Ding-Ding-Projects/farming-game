/**
 * The frameless window's custom title bar.
 *
 * `electron/main.ts` creates the window with `frame: false`, so this bar is the
 * window's only chrome. It is a `banner` landmark holding three things:
 *
 * 1. the wordmark, drawn with the game's own 5x7 face (`src/engine/font.ts`) onto a
 *    small canvas, so the shell and the farm are set in the same letterforms;
 * 2. the drag region, via `-webkit-app-region`, which also maximises on double-click;
 * 3. real `<button>` minimise / maximise / close controls with accessible names, an
 *    announced maximised state, visible focus and keyboard parity with the mouse.
 *
 * Without `window.sprout` — the plain `npm run dev` browser — the controls are not
 * rendered at all. A control that looks functional and is not is the one thing the
 * contract will not have.
 *
 * Colour comes from the `tokens.css` custom properties. The canvases cannot read a
 * `var()`, so they mirror their host element's computed `color`, which means the
 * icons follow the same tokens the CSS does. `src/engine/palette.ts` supplies the
 * fallback should a token be missing; no colour is invented here.
 */

import { FONT_H, drawText, textWidth } from '../../engine/font'
import { PAL } from '../../engine/palette'
import { onLangChange, t } from '../core/i18n'

/** The product name. A fact: never translated, never restyled by the funny level. */
export const APP_NAME = 'Sprout Hollow'

/**
 * Stable ids for the appearance editor. `src/shell/ui/appearance.ts` can attach to
 * these without this file importing it; each element also carries the id as a
 * `data-appearance-id` attribute.
 */
export const TITLEBAR_APPEARANCE_IDS = [
  'titlebar',
  'titlebar.wordmark',
  'titlebar.minimize',
  'titlebar.maximize',
  'titlebar.close',
] as const

export interface TitleBar {
  /** The `banner` element. The caller decides where it goes in the document. */
  readonly el: HTMLElement
  /** The window's maximised state as last reported. Always false without a host. */
  isMaximized(): boolean
  /** Re-reads the language and the colour tokens, then repaints. */
  refresh(): void
  /** Detaches every listener and removes the bar from the document. */
  destroy(): void
}

/**
 * The window half of the preload bridge. `src/renderer/bridge.ts` owns the global
 * `Window['sprout']` type and declares only the three save channels, so this lane
 * duck-types its own half rather than fighting that declaration — which also means a
 * stale preload is detected honestly at runtime instead of assumed.
 */
interface WindowControls {
  minimizeWindow(): Promise<void>
  toggleMaximizeWindow(): Promise<boolean>
  closeWindow(): Promise<void>
  isWindowMaximized(): Promise<boolean>
  onWindowMaximizedChanged(listener: (maximized: boolean) => void): () => void
}

const CONTROL_METHODS = [
  'minimizeWindow',
  'toggleMaximizeWindow',
  'closeWindow',
  'isWindowMaximized',
  'onWindowMaximizedChanged',
] as const

function windowControls(): WindowControls | null {
  if (typeof window === 'undefined') return null
  const bridge: unknown = (window as unknown as { sprout?: unknown }).sprout
  if (bridge === null || typeof bridge !== 'object') return null
  const candidate = bridge as Partial<Record<(typeof CONTROL_METHODS)[number], unknown>>
  for (const method of CONTROL_METHODS) {
    if (typeof candidate[method] !== 'function') return null
  }
  return bridge as WindowControls
}

/* ------------------------------------------------------------------ pixel icons */

/**
 * Eight-by-eight glyphs in the same `#` on / `.` off notation as `src/engine/font.ts`.
 * Drawn, not vector, not emoji — section 8 of DESIGN.md holds for the shell's own
 * iconography too.
 */
const ICON_PX = 8
const ICON_SCALE = 2

const ICON_MINIMIZE: readonly string[] = [
  '........',
  '........',
  '........',
  '........',
  '.######.',
  '........',
  '........',
  '........',
]

const ICON_MAXIMIZE: readonly string[] = [
  '........',
  '.######.',
  '.#....#.',
  '.#....#.',
  '.#....#.',
  '.#....#.',
  '.######.',
  '........',
]

/** Two overlapping frames: the front one occludes the back one, as a restore should. */
const ICON_RESTORE: readonly string[] = [
  '..######',
  '..#....#',
  '######.#',
  '#....#.#',
  '#....#.#',
  '#....###',
  '#....#..',
  '######..',
]

const ICON_CLOSE: readonly string[] = [
  '........',
  '.#....#.',
  '..#..#..',
  '...##...',
  '...##...',
  '..#..#..',
  '.#....#.',
  '........',
]

/**
 * Sizes a canvas so one authored pixel lands on a whole number of device pixels at
 * any display scale — 100, 125, 150 or 200 % — then hands back a context already
 * transformed into authored-pixel space.
 */
function pixelContext(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  cssScale: number,
): CanvasRenderingContext2D | null {
  const raw = typeof window === 'undefined' ? 1 : window.devicePixelRatio
  const dpr = Number.isFinite(raw) && raw > 0 ? raw : 1
  const scale = Math.max(1, Math.round(cssScale * dpr))

  canvas.width = w * scale
  canvas.height = h * scale
  // Back-solving the CSS size from the device size keeps the mapping exact rather
  // than letting the compositor resample a 2x bitmap into a 1.25x box.
  canvas.style.width = `${(w * scale) / dpr}px`
  canvas.style.height = `${(h * scale) / dpr}px`

  const ctx = canvas.getContext('2d')
  if (ctx === null) return null
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, w, h)
  return ctx
}

function paintIcon(canvas: HTMLCanvasElement, rows: readonly string[], color: string): void {
  const ctx = pixelContext(canvas, ICON_PX, ICON_PX, ICON_SCALE)
  if (ctx === null) return
  ctx.fillStyle = color
  for (let y = 0; y < ICON_PX; y++) {
    const row = rows[y] ?? ''
    for (let x = 0; x < ICON_PX; x++) {
      if (row.charAt(x) === '#') ctx.fillRect(x, y, 1, 1)
    }
  }
}

/* ---------------------------------------------------------------------- styling */

const STYLE_ID = 'sh-titlebar-style'

/**
 * Component-scoped rules, injected once. Colour is read from `tokens.css`; the
 * `var()` fallbacks come from `src/engine/palette.ts` so a missing token degrades to
 * the right colour instead of to a browser default. There is no transition anywhere
 * in this bar, so `prefers-reduced-motion` has nothing left to switch off.
 */
function stylesheet(): string {
  return `
.sh-titlebar {
  --sh-titlebar-height: 32px;
  position: relative;
  z-index: 20;
  display: flex;
  align-items: stretch;
  box-sizing: border-box;
  width: 100%;
  min-height: var(--sh-titlebar-height);
  padding-left: 10px;
  background: var(--bark, ${PAL.bark});
  color: var(--parchment, ${PAL.parchment});
  border-bottom: 1px solid var(--ink, ${PAL.ink});
  box-shadow:
    inset 1px 1px 0 var(--grass-lit, ${PAL.grassLit}),
    0 2px 0 var(--shadow, ${PAL.shadow});
  overflow: hidden;
  -webkit-user-select: none;
  user-select: none;
  -webkit-app-region: drag;
  app-region: drag;
}

.sh-titlebar__brand {
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  min-width: 0;
  overflow: hidden;
  color: var(--cream, ${PAL.cream});
}

.sh-titlebar__wordmark {
  display: block;
  flex: 0 0 auto;
  image-rendering: pixelated;
}

.sh-titlebar__controls {
  display: flex;
  flex: 0 0 auto;
  align-items: stretch;
  margin-left: auto;
  padding-left: 12px;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.sh-titlebar__btn {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 46px;
  min-width: 24px;
  min-height: 24px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--parchment, ${PAL.parchment});
  font: inherit;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}

.sh-titlebar__btn[aria-pressed='true'] {
  background: var(--soil, ${PAL.soil});
  color: var(--cream, ${PAL.cream});
}

.sh-titlebar__btn:hover {
  background: var(--lantern, ${PAL.lantern});
  color: var(--ink, ${PAL.ink});
}

.sh-titlebar__btn:active {
  background: var(--cream, ${PAL.cream});
  color: var(--ink, ${PAL.ink});
}

.sh-titlebar__btn--close:hover {
  background: var(--berry, ${PAL.berry});
  color: var(--cream, ${PAL.cream});
}

.sh-titlebar__btn--close:active {
  background: var(--cream, ${PAL.cream});
  color: var(--berry, ${PAL.berry});
}

/*
 * Two rings, drawn inside the button so the bar's clip cannot eat them: a cream one
 * against the dark rest state and an ink one against the lantern and berry hovers.
 * Whichever the fill, one of the pair keeps its 3:1 edge.
 */
.sh-titlebar__btn:focus-visible {
  outline: 2px solid var(--cream, ${PAL.cream});
  outline-offset: -4px;
  box-shadow: inset 0 0 0 2px var(--ink, ${PAL.ink});
}

.sh-titlebar__icon {
  display: block;
  pointer-events: none;
  image-rendering: pixelated;
}

/* Never display:none — a hidden live region stops being read. */
.sh-titlebar__live {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (max-width: 720px) {
  .sh-titlebar__btn {
    width: 38px;
  }

  .sh-titlebar__controls {
    padding-left: 6px;
  }
}
`
}

function ensureStylesheet(doc: Document): void {
  if (doc.getElementById(STYLE_ID) !== null) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = stylesheet()
  doc.head.appendChild(style)
}

/** The computed value of a custom property, or the palette entry when unset. */
function tokenColor(el: Element, property: string, fallback: string): string {
  const value = getComputedStyle(el).getPropertyValue(property).trim()
  return value.length > 0 ? value : fallback
}

/* ------------------------------------------------------------------- the bar */

/** A double-click this soon after a reported change is the host's, not the user's. */
const ECHO_MS = 300

/** Frames to wait for the caller to mount the bar before painting from fallbacks. */
const MAX_MOUNT_WAITS = 240

/** Only to keep the description element's id unique if a second bar is ever built. */
let instances = 0

export function createTitleBar(): TitleBar {
  const doc = document
  ensureStylesheet(doc)

  const controls = windowControls()

  const bar = doc.createElement('header')
  bar.className = 'sh-titlebar'
  bar.setAttribute('role', 'banner')
  bar.dataset.appearanceId = 'titlebar'

  const brand = doc.createElement('div')
  brand.className = 'sh-titlebar__brand'

  const wordmark = doc.createElement('canvas')
  wordmark.className = 'sh-titlebar__wordmark'
  wordmark.setAttribute('role', 'img')
  wordmark.dataset.appearanceId = 'titlebar.wordmark'
  brand.appendChild(wordmark)
  bar.appendChild(brand)

  const live = doc.createElement('div')
  live.className = 'sh-titlebar__live'
  live.setAttribute('role', 'status')
  live.setAttribute('aria-live', 'polite')
  live.setAttribute('aria-atomic', 'true')
  bar.appendChild(live)

  // Describes the landmark, so entering the title bar tells you the drag region
  // double-clicks to maximise — the one gesture that has no visible control.
  instances += 1
  const hint = doc.createElement('span')
  hint.className = 'sh-titlebar__live'
  hint.id = `sh-titlebar-hint-${instances}`
  bar.appendChild(hint)
  bar.setAttribute('aria-describedby', hint.id)

  const controlBar = doc.createElement('div')
  controlBar.className = 'sh-titlebar__controls'

  function makeButton(id: string, modifier: string): HTMLButtonElement {
    const button = doc.createElement('button')
    button.type = 'button'
    button.className = `sh-titlebar__btn sh-titlebar__btn--${modifier}`
    button.dataset.appearanceId = id
    const icon = doc.createElement('canvas')
    icon.className = 'sh-titlebar__icon'
    icon.setAttribute('aria-hidden', 'true')
    button.appendChild(icon)
    controlBar.appendChild(button)
    return button
  }

  const minimizeBtn = controls === null ? null : makeButton('titlebar.minimize', 'minimize')
  const maximizeBtn = controls === null ? null : makeButton('titlebar.maximize', 'maximize')
  const closeBtn = controls === null ? null : makeButton('titlebar.close', 'close')
  if (controls !== null) bar.appendChild(controlBar)

  let maximized = false
  /** True once the host has told us a state, so a late start-up read cannot stomp it. */
  let reported = false
  let lastReportAt = 0
  let paintHandle = 0
  let destroyed = false
  let mountWaits = 0

  /** Maximise offers to fill the screen; once filled it offers to restore. */
  function maximizeLabel(): string {
    return maximized ? t('titlebar.restore') : t('titlebar.maximise')
  }

  function iconCanvas(button: HTMLButtonElement | null): HTMLCanvasElement | null {
    const canvas = button?.firstElementChild ?? null
    return canvas instanceof HTMLCanvasElement ? canvas : null
  }

  function paintWordmark(): void {
    const w = textWidth(APP_NAME) + 1
    const h = FONT_H + 1
    const ctx = pixelContext(wordmark, w, h, 2)
    if (ctx === null) return
    drawText(ctx, APP_NAME, 0, 0, tokenColor(brand, 'color', PAL.cream), {
      shadow: tokenColor(bar, '--shadow', PAL.shadow),
    })
  }

  function paint(): void {
    if (destroyed) return
    // A detached element has no computed style, so the icons would be painted from
    // the fallbacks and never corrected. Wait for the caller to mount us instead.
    if (!bar.isConnected && mountWaits < MAX_MOUNT_WAITS) {
      mountWaits++
      schedulePaint()
      return
    }
    paintWordmark()
    const buttons: Array<[HTMLButtonElement | null, readonly string[]]> = [
      [minimizeBtn, ICON_MINIMIZE],
      [maximizeBtn, maximized ? ICON_RESTORE : ICON_MAXIMIZE],
      [closeBtn, ICON_CLOSE],
    ]
    for (const [button, rows] of buttons) {
      const canvas = iconCanvas(button)
      if (button === null || canvas === null) continue
      // The icon mirrors the button's computed colour, so hover, active and the
      // pressed state all invert the glyph exactly as the stylesheet says they do.
      paintIcon(canvas, rows, tokenColor(button, 'color', PAL.parchment))
    }
  }

  function schedulePaint(): void {
    if (destroyed || paintHandle !== 0) return
    paintHandle = window.requestAnimationFrame(() => {
      paintHandle = 0
      paint()
    })
  }

  function relabel(): void {
    bar.setAttribute('aria-label', t('titlebar.label'))
    bar.title = t('titlebar.dragHint')
    hint.textContent = t('titlebar.doubleClickHint')
    wordmark.setAttribute('aria-label', t('app.name'))
    if (minimizeBtn !== null) {
      const label = t('titlebar.minimise')
      minimizeBtn.setAttribute('aria-label', label)
      minimizeBtn.title = label
    }
    if (maximizeBtn !== null) {
      const label = maximizeLabel()
      maximizeBtn.setAttribute('aria-label', label)
      maximizeBtn.setAttribute('aria-pressed', maximized ? 'true' : 'false')
      maximizeBtn.title = label
    }
    if (closeBtn !== null) {
      const label = t('titlebar.close')
      closeBtn.setAttribute('aria-label', label)
      closeBtn.title = label
    }
  }

  /**
   * `announce` is false only for the state we read at start-up: a window that opens
   * maximised is not news, a window the user maximises is.
   */
  function setMaximized(next: boolean, announce: boolean): void {
    reported = true
    lastReportAt = Date.now()
    if (next === maximized) return
    maximized = next
    relabel()
    schedulePaint()
    // `aria-pressed` carries the state to anyone on the button, but a double-click or
    // an OS-level change happens with focus elsewhere, so the control's new name is
    // spoken politely too.
    if (announce) live.textContent = maximizeLabel()
  }

  function toggleMaximize(): void {
    if (controls === null) return
    controls.toggleMaximizeWindow().then(
      (value) => setMaximized(value, true),
      () => undefined,
    )
  }

  if (minimizeBtn !== null && controls !== null) {
    minimizeBtn.addEventListener('click', () => {
      controls.minimizeWindow().catch(() => undefined)
    })
  }
  if (maximizeBtn !== null) maximizeBtn.addEventListener('click', toggleMaximize)
  if (closeBtn !== null && controls !== null) {
    closeBtn.addEventListener('click', () => {
      controls.closeWindow().catch(() => undefined)
    })
  }

  const onDoubleClick = (event: MouseEvent): void => {
    if (event.button !== 0) return
    const target = event.target
    if (target instanceof Node && controlBar.contains(target)) return
    // Some platforms maximise a frameless window from the drag region themselves and
    // still deliver the double-click. Toggling again would undo it, so a change the
    // host has just reported wins.
    if (Date.now() - lastReportAt < ECHO_MS) return
    toggleMaximize()
  }
  if (controls !== null) bar.addEventListener('dblclick', onDoubleClick)

  let lastDpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio
  const onResize = (): void => {
    if (window.devicePixelRatio === lastDpr) return
    lastDpr = window.devicePixelRatio
    schedulePaint()
  }
  window.addEventListener('resize', onResize)

  // Hover, focus and press change the computed colour the icons mirror.
  const repaintEvents = ['pointerenter', 'pointerleave', 'pointerdown', 'pointerup', 'focus', 'blur'] as const
  const onStateChange = (): void => schedulePaint()
  for (const button of [minimizeBtn, maximizeBtn, closeBtn]) {
    if (button === null) continue
    for (const name of repaintEvents) button.addEventListener(name, onStateChange)
  }

  const stopLang = onLangChange(() => {
    relabel()
    schedulePaint()
  })

  const stopMaximized =
    controls === null
      ? null
      : controls.onWindowMaximizedChanged((value) => setMaximized(value, true))

  relabel()
  schedulePaint()
  if (controls !== null) {
    controls.isWindowMaximized().then((value) => {
      if (!reported) setMaximized(value, false)
    }, () => undefined)
  }

  return {
    el: bar,
    isMaximized: (): boolean => maximized,
    refresh: (): void => {
      mountWaits = 0
      relabel()
      schedulePaint()
    },
    destroy: (): void => {
      if (destroyed) return
      destroyed = true
      if (paintHandle !== 0) {
        window.cancelAnimationFrame(paintHandle)
        paintHandle = 0
      }
      window.removeEventListener('resize', onResize)
      bar.removeEventListener('dblclick', onDoubleClick)
      for (const button of [minimizeBtn, maximizeBtn, closeBtn]) {
        if (button === null) continue
        for (const name of repaintEvents) button.removeEventListener(name, onStateChange)
      }
      stopLang()
      if (stopMaximized !== null) stopMaximized()
      bar.remove()
    },
  }
}

/** Creates the bar and appends it to `parent`. */
export function mountTitleBar(parent: HTMLElement): TitleBar {
  const bar = createTitleBar()
  parent.appendChild(bar.el)
  return bar
}
