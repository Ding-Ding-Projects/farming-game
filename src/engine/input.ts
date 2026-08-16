/**
 * Keyboard and pointer capture for the renderer.
 *
 * The rest of the game only ever sees logical 320x224 coordinates: every client
 * coordinate is pushed through the `toLogical` callback handed in by the frame loop.
 */

export interface PointerState {
  x: number
  y: number
  down: boolean
  pressed: boolean
  released: boolean
}

/** Autorepeat: hold for this long before the second fire. */
const REPEAT_DELAY = 300
/** Then fire this often. */
const REPEAT_INTERVAL = 90

/** Keys the game owns outright, so the page never scrolls under the canvas. */
const SWALLOWED = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'])

const clock: () => number =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? () => performance.now()
    : () => Date.now()

interface KeyRecord {
  nextRepeat: number
  /** Frame the repeat answer below was computed on, so a frame answers consistently. */
  repeatFrame: number
  repeatValue: boolean
}

export class Input {
  readonly pointer: PointerState = { x: -1, y: -1, down: false, pressed: false, released: false }

  private readonly target: HTMLCanvasElement
  private readonly toLogical: (cx: number, cy: number) => { x: number; y: number }
  private readonly keys = new Map<string, KeyRecord>()
  private readonly pressedKeys = new Set<string>()
  private frame = 0
  private overTarget = false
  private disposed = false

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (SWALLOWED.has(e.code)) e.preventDefault()
    // The OS repeat is ignored; `repeated()` runs the game's own, frame-stable clock.
    if (e.repeat || this.keys.has(e.code)) return
    const t = clock()
    this.keys.set(e.code, { nextRepeat: t + REPEAT_DELAY, repeatFrame: -1, repeatValue: false })
    this.pressedKeys.add(e.code)
  }

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (SWALLOWED.has(e.code)) e.preventDefault()
    this.keys.delete(e.code)
  }

  /** Alt-tab must not leave the farmer walking into the fence forever. */
  private readonly onBlur = (): void => {
    this.keys.clear()
    if (this.pointer.down) this.pointer.released = true
    this.pointer.down = false
    this.overTarget = false
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (!e.isPrimary || e.button !== 0) return
    this.overTarget = true
    this.trackPosition(e)
    if (!this.pointer.down) this.pointer.pressed = true
    this.pointer.down = true
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!e.isPrimary) return
    this.trackPosition(e)
  }

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (!e.isPrimary || e.button !== 0) return
    this.trackPosition(e)
    if (this.pointer.down) this.pointer.released = true
    this.pointer.down = false
  }

  private readonly onPointerCancel = (): void => {
    if (this.pointer.down) this.pointer.released = true
    this.pointer.down = false
  }

  private readonly onPointerEnter = (): void => {
    this.overTarget = true
  }

  private readonly onPointerLeave = (): void => {
    this.overTarget = false
    if (!this.pointer.down) {
      this.pointer.x = -1
      this.pointer.y = -1
    }
  }

  constructor(
    target: HTMLCanvasElement,
    toLogical: (cx: number, cy: number) => { x: number; y: number },
  ) {
    this.target = target
    this.toLogical = toLogical

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    // Move and release live on the window so a drag off the canvas still resolves.
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerCancel)
    this.target.addEventListener('pointerdown', this.onPointerDown)
    this.target.addEventListener('pointerenter', this.onPointerEnter)
    this.target.addEventListener('pointerleave', this.onPointerLeave)
  }

  down(code: string): boolean {
    return this.keys.has(code)
  }

  pressed(code: string): boolean {
    return this.pressedKeys.has(code)
  }

  repeated(code: string): boolean {
    const rec = this.keys.get(code)
    if (rec === undefined) return false
    if (rec.repeatFrame === this.frame) return rec.repeatValue

    let value = this.pressedKeys.has(code)
    if (!value) {
      const t = clock()
      if (t >= rec.nextRepeat) {
        value = true
        rec.nextRepeat += REPEAT_INTERVAL
        // A long stall (tab in the background) must not fire a burst on return.
        if (rec.nextRepeat <= t) rec.nextRepeat = t + REPEAT_INTERVAL
      }
    }
    rec.repeatFrame = this.frame
    rec.repeatValue = value
    return value
  }

  anyPressed(): boolean {
    return this.pressedKeys.size > 0 || this.pointer.pressed
  }

  /** Call once at the end of every frame. */
  endFrame(): void {
    this.pressedKeys.clear()
    this.pointer.pressed = false
    this.pointer.released = false
    this.frame++
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerCancel)
    this.target.removeEventListener('pointerdown', this.onPointerDown)
    this.target.removeEventListener('pointerenter', this.onPointerEnter)
    this.target.removeEventListener('pointerleave', this.onPointerLeave)
    this.keys.clear()
    this.pressedKeys.clear()
    this.pointer.down = false
    this.pointer.pressed = false
    this.pointer.released = false
  }

  private trackPosition(e: PointerEvent): void {
    // Off-canvas and not dragging: park the pointer where nothing can be hovered,
    // whatever `toLogical` does with out-of-range client coordinates.
    if (!this.overTarget && !this.pointer.down) {
      this.pointer.x = -1
      this.pointer.y = -1
      return
    }
    const p = this.toLogical(e.clientX, e.clientY)
    this.pointer.x = Math.floor(p.x)
    this.pointer.y = Math.floor(p.y)
  }
}
