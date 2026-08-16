/**
 * The scene contract the frame loop drives.
 *
 * The shell (`main.ts`) owns a stack of scenes and updates only the top one. A scene
 * draws itself and may hand back one command — push a panel, pop back, save, quit.
 * Everything a scene needs that outlives a frame lives on the shared `SceneContext`:
 * the one live `GameState`, the toast queue, and the 6 fps sub-clock.
 */

import type { DayReport, GameState } from '../game/types'
import type { Input } from '../engine/input'
import type { UI } from '../engine/ui'
import { LOGICAL_H, LOGICAL_W } from '../game/constants'
import { PAL } from '../engine/palette'
import { FONT_H, drawText, textWidth } from '../engine/font'
import { rect, woodPanel } from '../engine/pixel'
import { beatOf } from '../art/tiles'

export type SceneId = 'title' | 'world' | 'shop' | 'inventory' | 'sleep' | 'help'

/**
 * What a scene asks the shell to do after it has drawn. `newGame` and `loadGame`
 * belong to the shell because it owns the seed and the save file, not the scenes.
 */
export type SceneCommand =
  | { kind: 'push'; scene: Scene }
  | { kind: 'replace'; scene: Scene }
  | { kind: 'pop' }
  | { kind: 'save' }
  | { kind: 'newGame' }
  | { kind: 'loadGame' }
  | { kind: 'quit' }

export interface Scene {
  readonly id: SceneId
  /**
   * Draw one frame and optionally command the shell. `dt` is milliseconds since the
   * previous frame; `frame` is the shell's monotonic 60 fps counter.
   */
  update(ctx: SceneContext, input: Input, ui: UI, dt: number, frame: number): SceneCommand | null
}

export type ToastTone = 'info' | 'good' | 'bad'

interface Toast {
  text: string
  tone: ToastTone
  life: number
}

/** A refusal stays up long enough to read and no longer. */
const TOAST_MS = 2200
const MAX_TOASTS = 3

const TONE_COLOR: Record<ToastTone, string> = {
  info: PAL.sky,
  good: PAL.grassLit,
  bad: PAL.berry,
}

/**
 * The mutable holder every scene shares. `state` is replaced wholesale by whatever
 * `src/game` hands back, so no scene ever mutates a `GameState` in place.
 */
export class SceneContext {
  /** The 320x224 logical framebuffer. Everything is drawn here. */
  readonly g: CanvasRenderingContext2D

  state: GameState

  /** True while a save exists on disk. The title scene gates CONTINUE on it. */
  hasSave = false

  /** The shell's frame counter, mirrored here by `tick`. */
  frame = 0

  /** The 6 fps sub-clock of DESIGN section 5. Frozen at 0 under reduced motion. */
  beat = 0

  /** What the last night produced, kept so the shell can re-show it if it wants. */
  report: DayReport | null = null

  /**
   * Where the toast stack is anchored, bottom edge first. Each scene sets it while it
   * draws; the shell paints the stack once, after the top scene, so a panel over the
   * world does not get the same toast drawn twice in two places.
   */
  toastY = LOGICAL_H - 6

  /** Wired to `announce.ts` by the shell; a no-op until then. */
  announce: (message: string) => void = () => {}

  private readonly toasts: Toast[] = []

  constructor(g: CanvasRenderingContext2D, state: GameState) {
    this.g = g
    this.state = state
  }

  /**
   * Advances the clocks and ages the toasts. The *active scene* calls this once at
   * the top of its `update`, which is exactly once per frame — the shell does not.
   */
  tick(dt: number, frame: number): void {
    this.frame = frame
    this.beat = beatOf(frame)
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].life -= dt
      if (this.toasts[i].life <= 0) this.toasts.splice(i, 1)
    }
  }

  /** A short line on the world, never a modal. Repeats refresh instead of stacking. */
  toast(text: string, tone: ToastTone = 'info'): void {
    if (text.length === 0) return
    const last = this.toasts[this.toasts.length - 1]
    if (last !== undefined && last.text === text) {
      last.life = TOAST_MS
      last.tone = tone
      return
    }
    this.toasts.push({ text, tone, life: TOAST_MS })
    while (this.toasts.length > MAX_TOASTS) this.toasts.shift()
  }

  /** Toast it and say it to the screen reader in one move. */
  say(text: string, tone: ToastTone = 'info'): void {
    this.toast(text, tone)
    this.announce(text)
  }

  clearToasts(): void {
    this.toasts.length = 0
  }

  /** Stacks the live toasts upward from `bottomY`, centred. */
  drawToasts(bottomY: number): void {
    let y = bottomY
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i]
      const h = FONT_H + 8
      const w = Math.min(LOGICAL_W - 24, textWidth(t.text) + 16)
      const x = Math.floor((LOGICAL_W - w) / 2)
      y -= h + 3
      woodPanel(this.g, x, y, w, h, { thin: true })
      rect(this.g, x + 2, y + 2, 2, h - 4, TONE_COLOR[t.tone])
      drawText(this.g, t.text, x + 7, y + 4, PAL.ink, { maxWidth: w - 10 })
    }
  }
}
