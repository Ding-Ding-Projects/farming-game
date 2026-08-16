/**
 * Immediate-mode widgets, drawn as carved wood (DESIGN.md section 6).
 *
 * One instance is reused for the whole run: `begin()` at the top of a frame, widgets,
 * then `end()`. Buttons carry a keyboard focus index alongside pointer hover, so every
 * panel is fully operable without a mouse. Registering buttons in a stable order across
 * frames is the caller's job.
 */

import type { Input } from './input'
import { PAL, shade } from './palette'
import { woodPanel, rect, outline, dither, hline } from './pixel'
import { drawText, drawTextCentered, FONT_H } from './font'

/** A thin wood frame is 1 px ink outline + 1 px bark frame. */
const BUTTON_INSET = 2

/** Height of the title strip inside a panel, when it has a title. */
const TITLE_H = 13

export interface ButtonOpts {
  disabled?: boolean
  selected?: boolean
}

export class UI {
  private ctx: CanvasRenderingContext2D | null = null
  private input: Input | null = null

  private ids: string[] = []
  private disabledIds = new Set<string>()
  private prevIds: string[] = []
  private prevDisabled = new Set<string>()

  private focusId: string | null = null
  private focusIndex = 0
  /** Button the pointer went down on; only it can complete a click. */
  private activeId: string | null = null
  /** One Enter/Space press activates at most one button per frame. */
  private activateUsed = false

  begin(ctx: CanvasRenderingContext2D, input: Input): void {
    this.ctx = ctx
    this.input = input
    this.ids = []
    this.disabledIds = new Set<string>()
    this.activateUsed = false
  }

  panel(x: number, y: number, w: number, h: number, title?: string): void {
    const ctx = this.ctx
    if (ctx === null) return
    woodPanel(ctx, x, y, w, h)
    if (title !== undefined && title.length > 0) {
      drawTextCentered(ctx, title, x + Math.floor(w / 2), y + 4, PAL.ink)
      const inner = w - 8
      if (inner > 0) hline(ctx, x + 4, y + TITLE_H, inner, PAL.bark)
    }
  }

  label(text: string, x: number, y: number, color?: string): void {
    const ctx = this.ctx
    if (ctx === null) return
    drawText(ctx, text, x, y, color ?? PAL.ink)
  }

  /** Returns true on the frame it is activated, by click or by keyboard focus + Enter. */
  button(
    id: string,
    label: string,
    x: number,
    y: number,
    w: number,
    h: number,
    opts?: ButtonOpts,
  ): boolean {
    const disabled = opts?.disabled === true
    const selected = opts?.selected === true

    this.ids.push(id)
    if (disabled) this.disabledIds.add(id)

    const ctx = this.ctx
    const input = this.input
    if (ctx === null || input === null) return false

    const p = input.pointer
    const hovered = !disabled && p.x >= x && p.x < x + w && p.y >= y && p.y < y + h

    let clicked = false
    if (!disabled) {
      if (hovered && p.pressed) {
        this.activeId = id
        this.focusId = id
      }
      if (p.released && this.activeId === id && hovered) clicked = true
    }
    const held = !disabled && this.activeId === id && p.down && hovered
    const focused = this.focusId === id

    if (
      !disabled &&
      focused &&
      !this.activateUsed &&
      (input.pressed('Enter') || input.pressed('NumpadEnter') || input.pressed('Space'))
    ) {
      clicked = true
      this.activateUsed = true
    }

    woodPanel(ctx, x, y, w, h, { thin: true })

    const ix = x + BUTTON_INSET
    const iy = y + BUTTON_INSET
    const iw = w - BUTTON_INSET * 2
    const ih = h - BUTTON_INSET * 2

    let fill = PAL.parchment
    if (held) fill = PAL.cream
    else if (hovered) fill = selected ? shade(PAL.lantern, 0.3) : PAL.lantern
    else if (selected) fill = PAL.lantern

    // At rest, leave woodPanel's parchment and its soil seat alone; only a state
    // fill is worth painting over the carve.
    if (fill !== PAL.parchment && iw > 0 && ih > 0) rect(ctx, ix, iy, iw, ih, fill)
    drawTextCentered(
      ctx,
      label,
      x + Math.floor(w / 2),
      y + Math.max(0, Math.floor((h - FONT_H) / 2)),
      PAL.ink,
    )
    // Dither last so the label is greyed out with the interior, not over it.
    if (disabled && iw > 0 && ih > 0) dither(ctx, ix, iy, iw, ih, PAL.dusk)
    if (focused) outline(ctx, x, y, w, h, PAL.cream)

    return clicked
  }

  /** Moves keyboard focus between registered buttons. */
  focusNext(delta: number): void {
    if (delta === 0) return
    const mid = this.ids.length > 0
    const list = mid ? this.ids : this.prevIds
    const skip = mid ? this.disabledIds : this.prevDisabled
    const n = list.length
    if (n === 0) return

    const step = delta > 0 ? 1 : -1
    let index = this.focusId === null ? -1 : list.indexOf(this.focusId)
    if (index < 0) index = step > 0 ? -1 : 0

    const moves = Math.min(Math.abs(delta), n)
    for (let m = 0; m < moves; m++) {
      let next = index
      for (let tries = 0; tries < n; tries++) {
        next = (((next + step) % n) + n) % n
        if (!skip.has(list[next])) break
      }
      index = next
    }

    this.focusIndex = index
    this.focusId = list[index]
  }

  focusedId(): string | null {
    return this.focusId
  }

  end(): void {
    const input = this.input
    if (input !== null && !input.pointer.down) this.activeId = null

    if (this.ids.length === 0) {
      this.focusId = null
      this.focusIndex = 0
    } else {
      const at = this.focusId === null ? -1 : this.ids.indexOf(this.focusId)
      if (at >= 0) {
        this.focusIndex = at
      } else {
        // The focused button is gone: clamp the index into the shorter list and
        // settle on the first thing there that can actually be pressed.
        const start = Math.min(Math.max(this.focusIndex, 0), this.ids.length - 1)
        let landed = start
        for (let i = 0; i < this.ids.length; i++) {
          const probe = (start + i) % this.ids.length
          if (!this.disabledIds.has(this.ids[probe])) {
            landed = probe
            break
          }
        }
        this.focusIndex = landed
        this.focusId = this.ids[landed]
      }
    }

    this.prevIds = this.ids
    this.prevDisabled = this.disabledIds
    this.ctx = null
    this.input = null
  }
}
