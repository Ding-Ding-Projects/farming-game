/**
 * The DOM primitives the appearance, colour, search-field and regex-builder modules of
 * this lane share.
 *
 * They live in one place rather than in `colorpicker.ts` because four modules need them
 * and a module may not import its own importer: `searchfield.ts` needs the anchored
 * popover, `colorpicker.ts` needs the search field, and a cycle between the two would be
 * a seam waiting to break. Nothing here knows about colour beyond `tok()`, which only
 * spells a palette entry as a custom property.
 *
 * The stylesheet at the foot of the file is injected once, under one id, for every module
 * of this group. Colour is taken from the `--pal-*` custom properties with the matching
 * `palette.ts` value as the CSS fallback, so a control is correct whether or not
 * `tokens.css` has been loaded yet, and no hex is written here by hand.
 */

import { PAL } from '../../engine/palette'
import type { PaletteName } from '../../engine/palette'
import { t as i18nT } from '../core/i18n'

/* ------------------------------------------------------------------ *
 * i18n seam
 * ------------------------------------------------------------------ */

export type TextParams = Record<string, string | number>

/**
 * `t()` is typed against the string catalogue owned by the i18n lane, which is authored in
 * parallel with this one, so the call goes through a widened signature.
 *
 * `t()` documents that an unknown key comes back verbatim. That is the right behaviour for
 * it and the wrong one here, because a key returned verbatim has dropped its parameters —
 * and parameters are the facts: the hex, the contrast ratio, the key binding. So a verbatim
 * return is treated as "not in the catalogue yet" and the facts are appended. Nothing here
 * invents English, and the moment the catalogue gains the key this path stops running.
 */
const translate = i18nT as unknown as (key: string, params?: TextParams) => string

export function tr(key: string, params?: TextParams): string {
  let out: unknown
  try {
    out = translate(key, params)
  } catch {
    out = undefined
  }
  if (typeof out === 'string' && out.length > 0 && out !== key) return out
  if (!params) return key
  const values = Object.keys(params).map((k) => `${k}=${String(params[k])}`)
  return values.length > 0 ? `${key} (${values.join(', ')})` : key
}
/* ------------------------------------------------------------------ *
 * DOM primitives shared with appearance.ts
 * ------------------------------------------------------------------ */

/** `var(--pal-name, <the real palette value>)`. Correct with or without tokens.css. */
export function tok(name: PaletteName): string {
  return `var(--pal-${name}, ${PAL[name]})`
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (parent) parent.appendChild(node)
  return node
}

let uid = 0
export function nextId(prefix: string): string {
  uid += 1
  return `${prefix}-${uid}`
}

/** Injects a stylesheet once per id. Returns immediately on a second call. */
export function ensureStyles(id: string, css: string): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(id)) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = css
  document.head.appendChild(style)
}

let liveRegion: HTMLElement | null = null
let liveTimer = 0

/** Polite announcement into one shared visually hidden live region. */
export function announce(message: string): void {
  if (typeof document === 'undefined') return
  if (!liveRegion || !liveRegion.isConnected) {
    liveRegion = document.createElement('div')
    liveRegion.id = 'sh-appearance-live'
    liveRegion.className = 'sh-vh'
    liveRegion.setAttribute('role', 'status')
    liveRegion.setAttribute('aria-live', 'polite')
    document.body.appendChild(liveRegion)
  }
  const region = liveRegion
  window.clearTimeout(liveTimer)
  // Re-announce an identical message by clearing first.
  region.textContent = ''
  liveTimer = window.setTimeout(() => {
    region.textContent = message
  }, 60)
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function focusableWithin(root: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = []
  root.querySelectorAll<HTMLElement>(FOCUSABLE).forEach((node) => {
    if (node.hidden) return
    if (node.closest('[hidden]')) return
    out.push(node)
  })
  return out
}

export interface PopoverAnchor {
  /** The element the popover belongs to; focus returns here when it closes. */
  readonly element: HTMLElement
  /** Optional viewport point (a right-click position) to prefer over the element box. */
  readonly at?: { readonly x: number; readonly y: number }
}

export interface PopoverOpts {
  readonly anchor: PopoverAnchor
  readonly className: string
  readonly label: string
  /** Builds the contents. Returns the element to focus first, if any. */
  build(root: HTMLDivElement, close: () => void): HTMLElement | null
  onClose?(): void
}

export interface PopoverHandle {
  readonly root: HTMLDivElement
  close(): void
  reposition(): void
  isOpen(): boolean
}

/**
 * The open popovers, oldest first. A popover nested inside another — the regex builder
 * belonging to a search field inside the appearance editor — must not be treated as an
 * "outside" click by its parent, and closing a parent must take its children with it.
 */
const popoverStack: Array<{ root: HTMLDivElement; close: () => void }> = []

/**
 * An anchored popover: positioned beside its anchor, flipped and clamped so it can never
 * leave a 640 px viewport, closed by Esc or by a pointer outside it, with Tab cycling
 * inside it and focus returned to the anchor on close. It is deliberately *not* modal —
 * `notify.ts` owns the only blocking dialog in the shell.
 */
export function openPopover(opts: PopoverOpts): PopoverHandle {
  ensureStyles('sh-appearance-styles', SHARED_CSS)

  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const root = el('div', `sh-pop ${opts.className}`)
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-label', opts.label)
  root.tabIndex = -1
  document.body.appendChild(root)

  let open = true

  const close = (): void => {
    if (!open) return
    open = false
    const at = popoverStack.findIndex((e) => e.root === root)
    if (at >= 0) {
      const above = popoverStack.splice(at).slice(1)
      for (const child of above) child.close()
    }
    document.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('resize', reposition)
    window.removeEventListener('scroll', reposition, true)
    root.remove()
    if (opts.onClose) opts.onClose()
    const back = opts.anchor.element.isConnected ? opts.anchor.element : previous
    if (back && back.isConnected) {
      if (back.tabIndex < 0 && !back.hasAttribute('tabindex')) back.tabIndex = -1
      back.focus()
    }
  }

  function reposition(): void {
    positionPopover(root, opts.anchor)
  }

  function onPointerDown(ev: PointerEvent): void {
    const target = ev.target
    if (!(target instanceof Node)) return
    if (root.contains(target) || opts.anchor.element.contains(target)) return
    // A click inside a popover opened later than this one belongs to that one.
    const mine = popoverStack.findIndex((e) => e.root === root)
    const hit = popoverStack.findIndex((e) => e.root.contains(target))
    if (hit >= 0 && mine >= 0 && hit >= mine) return
    close()
  }

  popoverStack.push({ root, close })

  root.addEventListener('keydown', (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      ev.preventDefault()
      ev.stopPropagation()
      close()
      return
    }
    if (ev.key !== 'Tab') return
    const items = focusableWithin(root)
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (ev.shiftKey && (active === first || active === root)) {
      ev.preventDefault()
      last.focus()
    } else if (!ev.shiftKey && active === last) {
      ev.preventDefault()
      first.focus()
    }
  })

  const initial = opts.build(root, close)
  reposition()
  document.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('resize', reposition)
  window.addEventListener('scroll', reposition, true)
  ;(initial ?? root).focus()

  return { root, close, reposition, isOpen: () => open }
}

/** Places a popover under its anchor, flipping above and clamping to the viewport. */
export function positionPopover(root: HTMLElement, anchor: PopoverAnchor): void {
  const margin = 8
  const vw = window.innerWidth
  const vh = window.innerHeight
  root.style.maxWidth = `${Math.max(200, vw - margin * 2)}px`
  root.style.maxHeight = `${Math.max(160, vh - margin * 2)}px`

  const box = root.getBoundingClientRect()
  const rect = anchor.at
    ? { left: anchor.at.x, right: anchor.at.x, top: anchor.at.y, bottom: anchor.at.y }
    : anchor.element.getBoundingClientRect()

  let left = rect.left
  if (left + box.width > vw - margin) left = vw - margin - box.width

  let top = rect.bottom + 4
  if (top + box.height > vh - margin) {
    const above = rect.top - 4 - box.height
    top = above >= margin ? above : vh - margin - box.height
  }

  // The anchor can be somewhere impossible — scrolled out of the top of its own scroll
  // container, or off the side of a 640 px window. Preferences are computed first and
  // clamped last, so the popover is always reachable even when its anchor is not.
  const clamp2 = (v: number, size: number, extent: number): number =>
    Math.min(Math.max(v, margin), Math.max(margin, extent - margin - size))

  root.style.left = `${Math.round(clamp2(left, box.width, vw))}px`
  root.style.top = `${Math.round(clamp2(top, box.height, vh))}px`
}
/* ------------------------------------------------------------------ *
 * Styles
 *
 * Injected rather than added to base.css, which belongs to another lane. Colour comes
 * from the --pal-* custom properties with the palette.ts value as the CSS fallback, so
 * there is no literal hex here. Sizes are in rem so the 100/125/150/200 % scale ladder
 * carries them, and every interactive target is at least 1.5rem (24 px) square.
 * ------------------------------------------------------------------ */

export const SHARED_STYLE_ID = 'sh-appearance-styles'

/** Injects the sheet below once, for any module in this group. */
export function ensureSharedStyles(): void {
  ensureStyles(SHARED_STYLE_ID, SHARED_CSS)
}

const SHARED_CSS = `
.sh-vh{position:absolute!important;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
.sh-pop{position:fixed;z-index:60;box-sizing:border-box;display:flex;flex-direction:column;gap:.4rem;
  padding:.5rem;overflow:auto;font:inherit;color:${tok('ink')};background:${tok('parchment')};
  border:1px solid ${tok('ink')};outline:3px solid ${tok('bark')};outline-offset:-4px;
  box-shadow:2px 2px 0 ${tok('shadow')}}
.sh-pop-title{margin:0;font-size:1em;font-weight:700;color:${tok('ink')}}
/* Labels inherit their surface's colour so a control group is legible on parchment and on
   a dark panel alike. Only the parts that bring their own background name a colour. */
.sh-small{margin:0;font-size:.8em;color:inherit}
.sh-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.sh-btn{box-sizing:border-box;min-height:1.5rem;min-width:1.5rem;padding:.15rem .4rem;font:inherit;
  color:${tok('ink')};background:${tok('parchment')};border:1px solid ${tok('bark')};cursor:pointer}
.sh-btn:hover:not(:disabled){background:${tok('lantern')}}
.sh-btn:active:not(:disabled){color:${tok('cream')};background:${tok('ink')}}
.sh-btn:disabled{color:${tok('dusk')};background:${tok('parchment')};cursor:default}
.sh-btn[aria-pressed="true"]{color:${tok('cream')};background:${tok('bark')}}
.sh-pop :focus-visible,.sh-cp :focus-visible,.sh-search :focus-visible{outline:2px solid ${tok('lantern')};outline-offset:2px}
.sh-search{display:flex;flex-direction:column;gap:.2rem}
.sh-search-bar{display:flex;flex-wrap:wrap;gap:.25rem;align-items:center}
.sh-search-input{box-sizing:border-box;flex:1 1 6rem;min-width:0;min-height:1.5rem;padding:.15rem .3rem;
  font:inherit;color:${tok('ink')};background:${tok('cream')};border:1px solid ${tok('bark')}}
.sh-search-input[aria-invalid="true"]{border-color:${tok('berry')};outline:1px solid ${tok('berry')}}
.sh-search-input::-webkit-search-cancel-button{display:none}
.sh-search-clear[hidden]{display:none}
.sh-search-status{margin:0;font-size:.75em;font-weight:700;color:${tok('berry')};overflow-wrap:anywhere}
.sh-search-status:empty{display:none}
.sh-search-hint{margin:0;font-size:.75em;color:inherit;opacity:.85;overflow-wrap:anywhere}
.sh-search-hint:empty{display:none}
.sh-check{display:inline-flex;gap:.25rem;align-items:center;min-height:1.5rem;font-size:.8em;cursor:pointer}
.sh-check input[type="checkbox"]{width:1.5rem;height:1.5rem;margin:0;flex:0 0 auto;accent-color:${tok('lantern')}}
.sh-builder-toggles{display:flex;flex-wrap:wrap;gap:.35rem}
.sh-builder-row{display:flex;flex-wrap:wrap;gap:.25rem;align-items:center}
.sh-builder{width:min(26rem,calc(100vw - 1rem))}
.sh-builder-sample{box-sizing:border-box;width:100%;min-height:3rem;resize:vertical}
/* The match list is bounded in height as well as in count: a pattern that catches a
   thousand things must not push the buttons below it off the screen. */
.sh-builder-matches{margin:0;padding:0 0 0 .9rem;max-height:9rem;overflow:auto;
  font-size:.75em;overflow-wrap:anywhere}
.sh-builder-matches:empty{display:none}
.sh-builder-groups{margin:0;padding:0 0 0 .9rem;list-style:circle}
/* Sized against its container, never the viewport: the picker is used both standalone and
   nested inside the appearance editor, where a vw-based width overflows sideways. */
.sh-cp{box-sizing:border-box;display:flex;flex-direction:column;gap:.4rem;width:100%;max-width:20rem;min-width:0;
  font:inherit;color:inherit}
.sh-cp-field{position:relative;width:100%;height:8rem;min-height:6rem;cursor:crosshair;touch-action:none;
  border:1px solid ${tok('ink')};
  background:
    linear-gradient(to top,hsl(0,0%,0%),hsla(0,0%,0%,0)),
    linear-gradient(to right,hsl(0,0%,100%),hsla(0,0%,100%,0)),
    var(--sh-cp-hue-color,hsl(0,100%,50%))}
.sh-cp-thumb{position:absolute;box-sizing:border-box;width:1.5rem;height:1.5rem;padding:0;margin:0;
  left:calc(var(--sh-cp-s,0) * 1%);top:calc((100 - var(--sh-cp-v,0)) * 1%);transform:translate(-50%,-50%);
  background:transparent;border:0;cursor:crosshair}
.sh-cp-thumb::after{content:"";position:absolute;left:50%;top:50%;width:.75rem;height:.75rem;
  transform:translate(-50%,-50%);background:var(--sh-cp-color,transparent);
  border:2px solid ${tok('cream')};box-shadow:0 0 0 1px ${tok('ink')}}
.sh-cp-slider{display:flex;gap:.4rem;align-items:center}
.sh-cp-slider label{flex:0 0 5rem}
.sh-cp-slider input[type="range"]{flex:1 1 auto;min-width:0;min-height:1.5rem;accent-color:${tok('lantern')}}
.sh-cp-hue{background:linear-gradient(to right,hsl(0,100%,50%),hsl(60,100%,50%),hsl(120,100%,50%),hsl(180,100%,50%),hsl(240,100%,50%),hsl(300,100%,50%),hsl(360,100%,50%));
  border:1px solid ${tok('ink')}}
.sh-cp-alpha{border:1px solid ${tok('ink')};
  background:
    linear-gradient(to right,hsla(0,0%,100%,0),var(--sh-cp-color,${tok('ink')})),
    repeating-conic-gradient(${tok('parchment')} 0% 25%,${tok('dusk')} 0% 50%) 0 0/.5rem .5rem}
.sh-cp-head{display:flex;gap:.4rem;align-items:center}
.sh-cp-preview{width:1.5rem;height:1.5rem;flex:0 0 auto;border:1px solid ${tok('ink')};
  background:
    linear-gradient(var(--sh-cp-color,transparent),var(--sh-cp-color,transparent)),
    repeating-conic-gradient(${tok('parchment')} 0% 25%,${tok('dusk')} 0% 50%) 0 0/.5rem .5rem}
.sh-cp-name{font-size:.85em;overflow-wrap:anywhere}
.sh-cp-contrast{margin:0;font-size:.8em;padding:.1rem .25rem;color:${tok('ink')};background:${tok('parchment')};
  border:1px solid ${tok('bark')}}
.sh-cp-contrast[data-fail="true"]{color:${tok('cream')};background:${tok('berry')};border-color:${tok('ink')};font-weight:700}
.sh-cp-texts{display:flex;flex-direction:column;gap:.2rem}
.sh-cp-text{display:flex;gap:.4rem;align-items:center}
.sh-cp-text label{flex:0 0 5rem}
.sh-cp-swatches-wrap{display:flex;flex-direction:column;gap:.25rem}
.sh-cp-swatches-wrap h3{font-size:.85em;font-weight:700;margin:0}
.sh-cp-swatches{display:flex;flex-wrap:wrap;gap:.25rem}
.sh-cp-swatch{box-sizing:border-box;width:1.75rem;height:1.75rem;padding:0;cursor:pointer;
  background:var(--sh-cp-swatch,${tok('ink')});border:1px solid ${tok('ink')}}
.sh-cp-swatch[aria-pressed="true"]{outline:2px solid ${tok('lantern')};outline-offset:-4px}
.sh-cp-swatch[hidden]{display:none}
@media (max-width:40rem){
  .sh-cp{max-width:18rem}
  .sh-cp-slider,.sh-cp-text{flex-wrap:wrap}
  .sh-cp-slider label,.sh-cp-text label{flex:1 0 100%}
}
@media (prefers-reduced-motion:reduce){
  .sh-pop,.sh-cp,.sh-cp *{transition:none!important;animation:none!important}
}
`
