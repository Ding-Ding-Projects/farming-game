/**
 * The game surface.
 *
 * Owns the four things no scene may own: the integer-scaled canvas, the frame loop
 * and its clocks, the scene stack, and the save file. Everything visible is drawn
 * into a 320x224 backing canvas and blitted onto the visible one at a whole-number
 * scale, with the leftover framed in ink.
 *
 * It no longer owns the document. `mount(container)` builds the canvas inside a
 * container the shell supplies and hands back a handle with `pause()`, `resume()`
 * and `dispose()`, so the Farm tab can stop burning frames the moment it is not the
 * visible tab. Nothing else moved: the whole-number scaling, the letterbox, the
 * `toLogical` mapping, the 6 fps sub-clock, the scene stack, the autosave, the audio
 * unlock, the `endFrame` discipline and the boot error panel are the same code they
 * were when the game shipped.
 *
 * This file knows nothing about the shell. Everything the shell wants to change —
 * translating a line, choosing a fixed pixel scale, turning autosave off — arrives as
 * a callback on {@link MountOptions}, so `src/renderer` still imports only `src/game`,
 * `src/engine` and `src/art`, exactly as `docs/ARCHITECTURE.md` requires.
 */

import { LOGICAL_H, LOGICAL_W } from '../game/constants'
import type { GameState } from '../game/types'
import { cloneState, createState } from '../game/state'
import { PAL } from '../engine/palette'
import { FONT_H, drawText, drawTextCentered, wrapText } from '../engine/font'
import { rect, woodPanel } from '../engine/pixel'
import { Input } from '../engine/input'
import { UI } from '../engine/ui'
import { isMuted, playSound, setMuted, unlockAudio } from '../engine/audio'
import { announce } from './announce'
import { loadSave, saveGame } from './bridge'
import { SceneContext } from './scene'
import type { Scene, SceneCommand, ToastTone } from './scene'
import { createTitleScene } from './scenes/title'
import { createWorldScene } from './scenes/world'

/** The art layer's `frame` argument is a 60 fps count; `SceneContext.beat` divides it down. */
const FRAME_MS = 1000 / 60

/**
 * A backgrounded tab hands back one enormous delta when it wakes. Clamping it means
 * the farm loses a little time rather than fast-forwarding a night in one frame.
 */
const MAX_FRAME_MS = 100

/**
 * The scale DESIGN.md section 2 asks for wherever the room exists. It is a floor, not
 * a promise: a container too small for it gets the largest whole number that *does*
 * fit, because a clipped farm is worse than a small one and the shell contract will
 * not have a surface that leaves the viewport. On any display at the 640x448 minimum
 * window this still resolves to 2 or better.
 */
const PREFERRED_MIN_SCALE = 2

/** The whole-number scales a caller may pin the farm to. Anything else is `auto`. */
const MAX_PINNED_SCALE = 6

/** The product name. A fact: never translated, never restyled by the funny level. */
const APP_NAME = 'Sprout Hollow'

/** Which surface a game line is on its way to when {@link MountOptions.present} sees it. */
export type GameMessageChannel = 'toast' | 'announce'

/**
 * One game line, ready for two very different surfaces.
 *
 * `canvas` is drawn with the game's own 5x7 bitmap face, which carries ASCII and
 * nothing else, so it must be renderable by that face. `text` is the full string for
 * the DOM — the live region, the caption strip and the history — where any script at
 * all is fine. A caller with nothing to translate returns the same string twice.
 */
export interface PresentedMessage {
  canvas: string
  text: string
}

export interface MountOptions {
  /**
   * Turns one raw game line into what the player reads. Called for every toast and
   * every announcement, including the ones the scenes compose themselves. Left out,
   * the game speaks exactly as it always did.
   */
  present?(raw: string, channel: GameMessageChannel, tone: ToastTone): PresentedMessage
  /**
   * The whole-number upscale to pin the farm to, or `'auto'` for the largest that
   * fits. A pinned scale too large for the container is clamped down to what fits.
   */
  pixelScale?(): 'auto' | number
  /** Whether the save is written automatically as the day advances. Defaults to true. */
  autosave?(): boolean
  /** A failure the player has already been shown on the canvas, for the shell to log. */
  onError?(message: string): void
}

export interface GameHandle {
  /** The canvas itself, so the host can label it and put focus on it. */
  readonly canvas: HTMLCanvasElement
  /** Stops the frame loop. Idempotent, and safe before the save has finished loading. */
  pause(): void
  /** Starts it again, discarding anything pressed while it was stopped. */
  resume(): void
  /** True while frames are being drawn. */
  isRunning(): boolean
  /** Writes the save now. A no-op before a farm has been started. */
  saveNow(): void
  /** Stops everything, writes the save and removes the canvas. */
  dispose(): void
}

interface Surface {
  canvas: HTMLCanvasElement
  view: CanvasRenderingContext2D
  back: HTMLCanvasElement
  g: CanvasRenderingContext2D
}

// ---------------------------------------------------------------------------
// input the background scenes get: none of it
// ---------------------------------------------------------------------------

/**
 * Scenes below the top still draw, so the world stays alive under a panel, but they
 * must not act. This is a real `Input` with its listeners taken straight back off,
 * so every query answers "nothing happened".
 */
class DormantInput extends Input {
  constructor(target: HTMLCanvasElement) {
    super(target, () => ({ x: -1, y: -1 }))
    this.dispose()
  }

  override down(): boolean {
    return false
  }

  override pressed(): boolean {
    return false
  }

  override repeated(): boolean {
    return false
  }

  override anyPressed(): boolean {
    return false
  }

  override endFrame(): void {
    // The shell ends the real input's frame; this one has no frame to end.
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function dayKeyOf(state: GameState): string {
  return `${state.year}:${state.season}:${state.day}`
}

function newSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

function messageOf(err: unknown): string {
  if (err instanceof Error && err.message.length > 0) return err.message
  if (typeof err === 'string' && err.length > 0) return err
  return 'SOMETHING WENT WRONG WHILE STARTING THE GAME'
}

// ---------------------------------------------------------------------------
// mount
// ---------------------------------------------------------------------------

/**
 * Builds the farm inside `container` and starts it. Everything below this line is
 * per-mount state: two farms in one document would not share a scale, a scene stack
 * or an input.
 */
export function mount(container: HTMLElement, options: MountOptions = {}): GameHandle {
  /* -- the surface -- */

  const canvas = document.createElement('canvas')
  canvas.id = 'game'
  canvas.width = LOGICAL_W
  canvas.height = LOGICAL_H
  canvas.tabIndex = 0
  canvas.setAttribute('aria-label', APP_NAME)
  // Layout only. Colour is the letterbox ink from the palette, which is the same value
  // `tokens.css` publishes as `--sh-bg-app`; the canvas cannot read a custom property.
  canvas.style.position = 'absolute'
  canvas.style.left = '0'
  canvas.style.top = '0'
  canvas.style.display = 'block'
  canvas.style.background = PAL.ink
  canvas.style.imageRendering = 'pixelated'
  canvas.style.touchAction = 'none'
  canvas.style.outline = 'none'

  // The canvas is positioned inside the container, so the container has to be able to
  // hold it. A host that already positions itself is left exactly as it is.
  if (typeof getComputedStyle === 'function' && getComputedStyle(container).position === 'static') {
    container.style.position = 'relative'
  }
  container.appendChild(canvas)

  const view = canvas.getContext('2d', { alpha: false })
  const back = document.createElement('canvas')
  back.width = LOGICAL_W
  back.height = LOGICAL_H
  const g = back.getContext('2d', { alpha: false })

  let surface: Surface | null = null
  if (view !== null && g !== null) {
    g.imageSmoothingEnabled = false
    surface = { canvas, view, back, g }
  }

  /* -- presentation geometry, in device pixels -- */

  let scale = PREFERRED_MIN_SCALE
  let originX = 0
  let originY = 0
  let lastCssW = -1
  let lastCssH = -1
  let lastDpr = -1
  let lastWanted = -1

  /** The pinned scale as a whole number, or 0 for `auto`. */
  function wantedScale(): number {
    let asked: 'auto' | number = 'auto'
    try {
      asked = options.pixelScale?.() ?? 'auto'
    } catch {
      // A host whose setting cannot be read gets the automatic scale, not a crash.
      asked = 'auto'
    }
    if (typeof asked !== 'number' || !Number.isFinite(asked)) return 0
    return Math.min(MAX_PINNED_SCALE, Math.max(1, Math.floor(asked)))
  }

  /** Largest whole-number scale that fits, centred, with an ink border round it. */
  function layout(s: Surface): void {
    const dpr = typeof window === 'undefined' ? 1 : Math.max(1, window.devicePixelRatio || 1)
    const box = container.getBoundingClientRect()
    // A container of zero size is a hidden tab. Keep the last good geometry rather than
    // collapsing the canvas to nothing and having to rebuild it on the way back.
    const cssW = Math.max(1, Math.round(box.width > 0 ? box.width : lastCssW > 0 ? lastCssW : LOGICAL_W * 2))
    const cssH = Math.max(1, Math.round(box.height > 0 ? box.height : lastCssH > 0 ? lastCssH : LOGICAL_H * 2))
    const wanted = wantedScale()
    if (cssW === lastCssW && cssH === lastCssH && dpr === lastDpr && wanted === lastWanted) return
    lastCssW = cssW
    lastCssH = cssH
    lastDpr = dpr
    lastWanted = wanted

    const deviceW = Math.max(1, Math.round(cssW * dpr))
    const deviceH = Math.max(1, Math.round(cssH * dpr))

    s.canvas.style.width = `${cssW}px`
    s.canvas.style.height = `${cssH}px`
    s.canvas.width = deviceW
    s.canvas.height = deviceH
    // Resizing a canvas resets its context, so the smoothing flag goes back on here.
    s.view.imageSmoothingEnabled = false

    // The largest whole number that fits — which is at or above the preferred floor
    // wherever the room exists, and below it only in a container too small to hold it.
    const fits = Math.max(1, Math.floor(Math.min(deviceW / LOGICAL_W, deviceH / LOGICAL_H)))
    scale = wanted === 0 ? fits : Math.min(wanted, fits)
    originX = Math.floor((deviceW - LOGICAL_W * scale) / 2)
    originY = Math.floor((deviceH - LOGICAL_H * scale) / 2)
  }

  function present(s: Surface): void {
    s.view.fillStyle = PAL.ink
    s.view.fillRect(0, 0, s.canvas.width, s.canvas.height)
    s.view.drawImage(
      s.back,
      0,
      0,
      LOGICAL_W,
      LOGICAL_H,
      originX,
      originY,
      LOGICAL_W * scale,
      LOGICAL_H * scale,
    )
  }

  /** Client pixels to the 320x224 grid, undoing the letterbox and the scale. */
  function toLogical(clientX: number, clientY: number): { x: number; y: number } {
    const box = canvas.getBoundingClientRect()
    const kx = box.width > 0 ? canvas.width / box.width : 1
    const ky = box.height > 0 ? canvas.height / box.height : 1
    return {
      x: ((clientX - box.left) * kx - originX) / scale,
      y: ((clientY - box.top) * ky - originY) / scale,
    }
  }

  /* -- failure -- */

  /** A player must never face a blank window with the reason only in devtools. */
  function paintError(message: string): void {
    const s = surface
    if (s === null) return
    layout(s)

    rect(s.g, 0, 0, LOGICAL_W, LOGICAL_H, PAL.shadow)

    const w = LOGICAL_W - 40
    const x = 20
    const lines = wrapText(message.length > 0 ? message : 'UNKNOWN ERROR', w - 20).slice(0, 8)
    const h = 46 + lines.length * (FONT_H + 3)
    const y = Math.max(8, Math.floor((LOGICAL_H - h) / 2))

    woodPanel(s.g, x, y, w, h)
    drawTextCentered(s.g, 'SPROUT HOLLOW COULD NOT START', x + w / 2, y + 8, PAL.berry)
    let ly = y + 24
    for (const line of lines) {
      drawText(s.g, line, x + 10, ly, PAL.ink, { maxWidth: w - 20 })
      ly += FONT_H + 3
    }
    drawTextCentered(s.g, 'RELOAD TO TRY AGAIN', x + w / 2, y + h - 13, PAL.bark)

    present(s)
  }

  function fail(err: unknown): void {
    const message = messageOf(err)
    failed = true
    try {
      console.error('[sprout hollow]', err)
    } catch {
      // No console is not a reason to lose the panel below.
    }
    try {
      paintError(message)
    } catch {
      // The canvas itself is gone. Nothing left to draw on.
    }
    try {
      options.onError?.(message)
    } catch {
      // The host's own reporting failing must not re-enter this handler.
    }
  }

  /* -- loop state -- */

  let running = false
  /** What the host asked for, which survives the loop not having started yet. */
  let wantRunning = true
  let failed = false
  let disposed = false
  let raf = 0
  let lastNow = -1
  let frameClock = 0
  let step: ((now: number) => void) | null = null
  let persistNow: () => void = () => {}
  let disposeInput: () => void = () => {}
  /** Ends one input frame without drawing one, so stale presses never survive a pause. */
  let clearInput: () => void = () => {}

  const tick = (now: number): void => {
    if (!running || step === null) return
    raf = requestAnimationFrame(tick)
    try {
      step(now)
    } catch (err) {
      stopLoop()
      fail(err)
    }
  }

  function stopLoop(): void {
    if (!running) return
    running = false
    if (raf !== 0) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }

  function startLoop(): void {
    if (running || failed || disposed || step === null) return
    running = true
    // A gap in wall-clock time is not a gap the farm lived through, and a key held
    // down over a shell control while the loop was stopped is not a farm command.
    lastNow = -1
    clearInput()
    raf = requestAnimationFrame(tick)
  }

  /* -- window-level listeners, all removed on dispose -- */

  const onResize = (): void => {
    if (surface !== null) layout(surface)
  }

  const onUnload = (): void => {
    persistNow()
  }

  // Audio must not exist before the player touches something, and unlocking it has
  // to happen inside the gesture itself rather than in the frame that follows.
  const armAudio = (): void => {
    unlockAudio()
    removeAudioArm()
  }

  function removeAudioArm(): void {
    window.removeEventListener('keydown', armAudio)
    window.removeEventListener('pointerdown', armAudio)
    window.removeEventListener('touchstart', armAudio)
  }

  window.addEventListener('keydown', armAudio)
  window.addEventListener('pointerdown', armAudio)
  window.addEventListener('touchstart', armAudio)
  window.addEventListener('resize', onResize)
  // `beforeunload` covers the window closing; `pagehide` catches the paths it misses.
  window.addEventListener('beforeunload', onUnload)
  window.addEventListener('pagehide', onUnload)

  const observer =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          onResize()
        })
      : null
  observer?.observe(container)

  /* -- boot -- */

  async function boot(): Promise<void> {
    const s = surface
    if (s === null) {
      throw new Error('THE BROWSER WOULD NOT GIVE THIS PAGE A 2D CANVAS')
    }
    layout(s)

    const saved = await loadSave()
    if (disposed) return

    const ctx = new SceneContext(s.g, createState(newSeed()))
    ctx.hasSave = saved !== null

    /* Every line the game speaks leaves through these two, and only these two. */
    const speak = (raw: string, channel: GameMessageChannel, tone: ToastTone): PresentedMessage => {
      if (options.present === undefined) return { canvas: raw, text: raw }
      try {
        const out = options.present(raw, channel, tone)
        return {
          canvas: typeof out.canvas === 'string' && out.canvas.length > 0 ? out.canvas : raw,
          text: typeof out.text === 'string' && out.text.length > 0 ? out.text : raw,
        }
      } catch {
        // A translator that throws costs the player nothing: they get the raw line.
        return { canvas: raw, text: raw }
      }
    }

    const baseToast = ctx.toast.bind(ctx)
    ctx.toast = (text: string, tone: ToastTone = 'info'): void => {
      baseToast(speak(text, 'toast', tone).canvas, tone)
    }
    ctx.announce = (text: string): void => {
      announce(speak(text, 'announce', 'info').text)
    }

    const input = new Input(s.canvas, toLogical)
    const dormant = new DormantInput(s.canvas)
    const ui = new UI()
    /** Scenes drawn underneath get their own UI so they cannot steal the top one's focus. */
    const backUi = new UI()

    const stack: Scene[] = [createTitleScene()]

    let savedState: GameState | null = saved
    let started = false
    let saveWanted = false
    let dayKey = ''

    const persist = (): void => {
      if (!started) return
      const snapshot = ctx.state
      savedState = snapshot
      ctx.hasSave = true
      saveGame(snapshot).catch(() => undefined)
    }
    persistNow = persist
    disposeInput = (): void => {
      input.dispose()
    }
    clearInput = (): void => {
      input.endFrame()
    }

    const requestSave = (): void => {
      saveWanted = true
    }

    /** The shell's Game setting. A host that does not answer keeps the old behaviour. */
    const autosaveOn = (): boolean => {
      try {
        return options.autosave?.() ?? true
      } catch {
        return true
      }
    }

    const enterFarm = (state: GameState): void => {
      ctx.state = state
      ctx.report = null
      ctx.clearToasts()
      stack.length = 0
      stack.push(createWorldScene())
      started = true
      dayKey = dayKeyOf(state)
      requestSave()
    }

    const toggleMute = (): void => {
      const next = !isMuted()
      setMuted(next)
      if (!next) playSound('select')
      ctx.say(next ? 'SOUND OFF.' : 'SOUND ON.', 'info')
    }

    const quit = (): void => {
      try {
        window.close()
      } catch {
        // A browser refuses to close a window it did not open.
      }
      ctx.say('CLOSE THE WINDOW TO QUIT.', 'info')
    }

    const apply = (command: SceneCommand): void => {
      switch (command.kind) {
        case 'push':
          stack.push(command.scene)
          break
        case 'replace':
          stack[stack.length - 1] = command.scene
          break
        case 'pop':
          // The bottom of the stack is the game itself; there is nothing behind it.
          if (stack.length > 1) stack.pop()
          break
        case 'save':
          requestSave()
          break
        case 'newGame':
          enterFarm(createState(newSeed()))
          break
        case 'loadGame':
          enterFarm(savedState === null ? createState(newSeed()) : cloneState(savedState))
          break
        case 'quit':
          quit()
          break
      }
    }

    step = (now: number): void => {
      const dt = lastNow < 0 ? 0 : Math.min(MAX_FRAME_MS, Math.max(0, now - lastNow))
      lastNow = now
      frameClock += dt
      const frame = Math.floor(frameClock / FRAME_MS)

      layout(s)
      rect(s.g, 0, 0, LOGICAL_W, LOGICAL_H, PAL.ink)

      const top = stack[stack.length - 1]

      // M belongs to the shell everywhere the world is not already listening for it.
      if (top.id !== 'world' && input.pressed('KeyM')) toggleMute()

      // Underneath first, frozen: dt 0 so nothing simulates and the toasts age once.
      for (let i = 0; i < stack.length - 1; i++) {
        stack[i].update(ctx, dormant, backUi, 0, frame)
      }
      const command = top.update(ctx, input, ui, dt, frame)

      // Exactly one toast stack a frame, anchored wherever the top scene asked for it.
      ctx.drawToasts(ctx.toastY)

      if (command !== null) apply(command)

      // Only sleeping turns the page of the calendar, so a new date means a night passed.
      if (started && dayKeyOf(ctx.state) !== dayKey) {
        dayKey = dayKeyOf(ctx.state)
        if (autosaveOn()) requestSave()
      }
      if (saveWanted) {
        saveWanted = false
        persist()
      }

      present(s)
      input.endFrame()
    }

    if (wantRunning) startLoop()
  }

  boot().catch((err: unknown) => {
    fail(err)
  })

  /* -- the handle -- */

  return {
    canvas,
    pause(): void {
      wantRunning = false
      stopLoop()
      // A tab switch is a good moment to be sure the day is on disk.
      try {
        persistNow()
      } catch {
        // Persistence is best effort; a failed write must not block the switch.
      }
    },
    resume(): void {
      if (disposed || failed) return
      wantRunning = true
      startLoop()
    },
    isRunning(): boolean {
      return running
    },
    saveNow(): void {
      try {
        persistNow()
      } catch {
        // As above.
      }
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      wantRunning = false
      stopLoop()
      try {
        persistNow()
      } catch {
        // As above.
      }
      disposeInput()
      removeAudioArm()
      window.removeEventListener('resize', onResize)
      window.removeEventListener('beforeunload', onUnload)
      window.removeEventListener('pagehide', onUnload)
      observer?.disconnect()
      step = null
      surface = null
      canvas.remove()
    },
  }
}
