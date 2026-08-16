/**
 * Notifications, and the one blocking dialog in the application.
 *
 * The stack sits bottom-right, never takes focus, and never blocks the app. Anything
 * the user needs to *know* goes here. Anything the user needs to *decide* — a
 * destructive action, unsaved work, consent — goes through `confirm()`, which is the
 * only focus-trapping dialog helper in the shell.
 *
 * Roles follow the contract: `status` for informational, success, warning and
 * progress; `alert` for failures. A live toast is inserted empty and filled on the
 * next frame, which is what makes a screen reader announce it reliably.
 *
 * Timeouts pause while the pointer is over the stack and while focus is inside it, so
 * a message can never expire out from under someone reading or tabbing through it.
 *
 * Colour comes from the tokens in `tokens.css`; the `var()` chains below name the
 * palette entry and fall through the plausible token spellings, so this module has no
 * literal colour of its own.
 */

import { onLangChange, t } from '../core/i18n'
import type { StringKey } from '../core/i18n'

/* ------------------------------------------------------------------ public types */

export type NotifyKind = 'info' | 'success' | 'warning' | 'failure' | 'progress'

/** A translated string and the facts interpolated into it. */
export interface Message {
  key: StringKey
  params?: Record<string, string | number>
}

/** A button on a notification. */
export interface NotifyAction {
  labelKey: StringKey
  params?: Record<string, string | number>
  run(): void
  /** Close the notification once the action has run. Defaults to true. */
  dismiss?: boolean
}

export interface NotifyInit {
  /** Defaults to `info`. */
  kind?: NotifyKind
  /** A stable id. Raising the same id again updates the live notification. */
  id?: string
  titleKey?: StringKey
  titleParams?: Record<string, string | number>
  messageKey: StringKey
  params?: Record<string, string | number>
  /** Milliseconds before it fades, or `null` to stay until dismissed. */
  timeoutMs?: number | null
  /** Defaults to true. A progress notification is not dismissible by default. */
  dismissible?: boolean
  actions?: NotifyAction[]
}

export interface NotifyPatch {
  kind?: NotifyKind
  titleKey?: StringKey | null
  titleParams?: Record<string, string | number>
  messageKey?: StringKey
  params?: Record<string, string | number>
  timeoutMs?: number | null
  /** 0..1, or `null` for "working, length unknown". Progress notifications only. */
  fraction?: number | null
  actions?: NotifyAction[]
}

export interface NotifyHandle {
  readonly id: string
  update(patch: NotifyPatch): void
  dismiss(): void
  isOpen(): boolean
}

export interface ProgressInit {
  id?: string
  titleKey?: StringKey
  titleParams?: Record<string, string | number>
  messageKey: StringKey
  params?: Record<string, string | number>
  /** 0..1, or `null` (the default) for an indeterminate bar. */
  fraction?: number | null
  dismissible?: boolean
}

export interface ProgressHandle extends NotifyHandle {
  /** Move the bar, optionally re-wording the line. */
  set(fraction: number | null, messageKey?: StringKey, params?: Record<string, string | number>): void
  /** Resolve as a success, with its own timeout. */
  succeed(messageKey: StringKey, params?: Record<string, string | number>): void
  /** Resolve as a failure: becomes an `alert`, and stays until dismissed. */
  fail(messageKey: StringKey, params?: Record<string, string | number>): void
}

export interface ConfirmInit {
  titleKey: StringKey
  titleParams?: Record<string, string | number>
  messageKey: StringKey
  params?: Record<string, string | number>
  confirmKey?: StringKey
  confirmParams?: Record<string, string | number>
  cancelKey?: StringKey
  /**
   * Styles the confirming button with the `berry` palette entry and refuses to treat
   * Enter-on-the-dialog as confirmation: the button must be activated explicitly.
   */
  destructive?: boolean
}

/* ------------------------------------------------------------------ constants */

/** How many notifications are on screen at once. The rest wait their turn. */
const MAX_VISIBLE = 4

/** A backlog past this is somebody looping; the oldest waiting entry is dropped. */
const MAX_QUEUED = 30

const DEFAULT_TIMEOUT: Record<NotifyKind, number | null> = {
  info: 6000,
  success: 5000,
  warning: 9000,
  failure: null,
  progress: null,
}

const STYLE_ID = 'sh-notify-styles'

/**
 * Keys this module owns. They are declared for real in `src/shell/core/strings.ts`;
 * the cast lets this file compile whichever lane lands first, and every one of them is
 * listed in the lane report so the i18n lane can add them.
 */
function key(id: string): StringKey {
  return id as StringKey
}

/* ------------------------------------------------------------------ styling */

/**
 * Every value below is a token from `tokens.css` — there is no colour, no radius and
 * no blur of this module's own. Motion runs on `--sh-dur-*`, which `tokens.css`
 * collapses to `0ms` under reduced motion in either direction, so there is no separate
 * reduced-motion block to keep in step here.
 *
 * The carved-wood panel of DESIGN.md 6 needs three boxes: an outer one carrying the
 * ink edge, the notched silhouette and the hard shadow; a frame carrying the bark
 * timber and its lit top-left edge; and the parchment interior with the soil dither
 * seating it. Borders and clip-paths cannot share one element without the clip eating
 * the outline.
 */
const CSS = `
.sh-notify-stack{position:fixed;inset:auto 0 0 auto;z-index:var(--sh-z-notify);display:flex;
  flex-direction:column;align-items:stretch;gap:var(--sh-space-2);padding:var(--sh-space-3);
  width:min(var(--sh-notify-w),calc(100vw - var(--sh-space-4)));pointer-events:none;
  font-family:var(--sh-font-ui);font-size:var(--sh-text-md);line-height:var(--sh-leading);
  color:var(--sh-fg)}
.sh-notify-queue{margin:0;pointer-events:auto;align-self:flex-end;
  padding:0 var(--sh-space-2);font-size:var(--sh-text-xs);color:var(--sh-fg);
  background:var(--sh-bg-panel);border:var(--sh-frame-thin) solid var(--sh-color-bark);
  clip-path:var(--sh-notch)}
.sh-notify-queue:empty{display:none}
.sh-notify-toast{pointer-events:auto;position:relative;background:var(--sh-bg-panel);
  border:var(--sh-px) solid var(--sh-color-ink);color:var(--sh-fg);clip-path:var(--sh-notch);
  filter:var(--sh-shadow-hard);animation:sh-notify-in var(--sh-dur-fast) var(--sh-ease) both}
.sh-notify-toast__frame{border:var(--sh-frame-thin) solid var(--sh-color-bark);
  box-shadow:var(--sh-hilite)}
.sh-notify-toast__body{position:relative;display:flex;align-items:flex-start;
  gap:var(--sh-space-2);padding:var(--sh-space-2);background:var(--sh-bg-panel)}
.sh-notify-toast__body::after{content:'';position:absolute;left:0;right:0;bottom:0;
  height:var(--sh-px2);pointer-events:none;background-image:var(--sh-dither-soil);
  background-size:var(--sh-dither-cell)}
.sh-notify-toast__accent{flex:0 0 var(--sh-px3);align-self:stretch;
  min-height:var(--sh-target-min);background:var(--sh-fg-info)}
.sh-notify-toast--success .sh-notify-toast__accent{background:var(--sh-fg-ok)}
.sh-notify-toast--warning .sh-notify-toast__accent{background:var(--sh-fg-accent)}
.sh-notify-toast--failure .sh-notify-toast__accent{background:var(--sh-fill-danger)}
.sh-notify-toast__text{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;
  gap:var(--sh-space-1)}
.sh-notify-toast__kind{margin:0;font-size:var(--sh-text-xs);letter-spacing:var(--sh-tracking-caps);
  line-height:var(--sh-leading-tight);text-transform:uppercase;color:var(--sh-fg-muted)}
.sh-notify-toast__title{margin:0;font-weight:700;overflow-wrap:anywhere}
.sh-notify-toast__message{margin:0;overflow-wrap:anywhere}
.sh-notify-toast__meter{height:var(--sh-px4);margin-top:var(--sh-space-1);
  border:var(--sh-frame-thin) solid var(--sh-color-bark);background:var(--sh-bg-field)}
.sh-notify-toast__meter-fill{display:block;height:100%;width:0;background:var(--sh-fg-accent);
  transition:width var(--sh-dur-fast) linear}
.sh-notify-toast__meter--busy .sh-notify-toast__meter-fill{width:100%;background:transparent;
  background-image:var(--sh-dither-dusk);background-size:var(--sh-dither-cell);
  animation:sh-notify-march var(--sh-dur-slow) steps(2,end) infinite}
.sh-notify-toast__actions{display:flex;flex-wrap:wrap;gap:var(--sh-space-1);
  margin-top:var(--sh-space-1)}
.sh-notify-toast__actions[hidden]{display:none}
.sh-notify-btn{font:inherit;font-size:var(--sh-text-sm);line-height:var(--sh-leading-tight);
  color:var(--sh-fg);background:var(--sh-bg-panel);
  border:var(--sh-frame-thin) solid var(--sh-color-bark);box-shadow:var(--sh-hilite);
  padding:var(--sh-space-1) var(--sh-space-2);min-height:var(--sh-target-min);
  min-width:var(--sh-target-min);clip-path:var(--sh-notch);cursor:pointer}
.sh-notify-btn:hover{background:var(--sh-fill-accent)}
.sh-notify-btn:active{background:var(--sh-bg-field);color:var(--sh-fg);box-shadow:var(--sh-sunk)}
.sh-notify-btn:focus-visible{outline:none;box-shadow:var(--sh-focus-ring)}
.sh-notify-btn--danger{background:var(--sh-fill-danger);color:var(--sh-fg-on-dark-strong);
  border-color:var(--sh-color-ink);box-shadow:none}
.sh-notify-btn--danger:hover{background:var(--sh-fill-danger);
  box-shadow:inset 0 0 0 var(--sh-px) var(--sh-fg-on-dark-strong)}
.sh-notify-btn--danger:active{background:var(--sh-color-berry);color:var(--sh-color-ink)}
.sh-notify-btn--danger:focus-visible{box-shadow:var(--sh-focus-ring-dark)}
.sh-notify-btn--close{flex:0 0 auto;display:flex;align-items:center;justify-content:center;
  padding:0;font-size:var(--sh-text-lg)}
.sh-notify-modal{position:fixed;inset:0;z-index:var(--sh-z-dialog);display:flex;
  align-items:center;justify-content:center;padding:var(--sh-space-4);
  background:color-mix(in srgb,var(--sh-color-shadow) calc(var(--sh-backdrop-alpha) * 100%),
    transparent);
  font-family:var(--sh-font-ui);font-size:var(--sh-text-md);line-height:var(--sh-leading);
  color:var(--sh-fg)}
.sh-notify-dialog{width:min(var(--sh-dialog-w),calc(100vw - var(--sh-space-6)));
  max-height:calc(100vh - var(--sh-space-6));overflow:auto;background:var(--sh-bg-panel);
  border:var(--sh-px) solid var(--sh-color-ink);clip-path:var(--sh-notch);
  filter:var(--sh-shadow-lift)}
.sh-notify-dialog__frame{border:var(--sh-frame) solid var(--sh-color-bark);
  box-shadow:var(--sh-hilite)}
.sh-notify-dialog__body{position:relative;display:flex;flex-direction:column;
  gap:var(--sh-space-3);padding:var(--sh-space-4);background:var(--sh-bg-panel)}
.sh-notify-dialog__body::after{content:'';position:absolute;left:0;right:0;bottom:0;
  height:var(--sh-px2);pointer-events:none;background-image:var(--sh-dither-soil);
  background-size:var(--sh-dither-cell)}
.sh-notify-dialog__title{margin:0;font-size:var(--sh-text-xl);line-height:var(--sh-leading-tight);
  font-weight:700}
.sh-notify-dialog__message{margin:0;overflow-wrap:anywhere}
.sh-notify-dialog__hint{margin:0;font-size:var(--sh-text-sm);color:var(--sh-fg-muted)}
.sh-notify-dialog__actions{display:flex;flex-wrap:wrap;gap:var(--sh-space-2);
  justify-content:flex-end}
@keyframes sh-notify-in{from{opacity:0;transform:translateY(var(--sh-px2))}
  to{opacity:1;transform:none}}
@keyframes sh-notify-march{from{background-position:0 0}
  to{background-position:var(--sh-px4) 0}}
@media (max-width:40rem){
  .sh-notify-stack{width:calc(100vw - var(--sh-space-4))}
  .sh-notify-dialog__actions{justify-content:stretch}
  .sh-notify-dialog__actions .sh-notify-btn{flex:1 1 auto}
}
`

function ensureStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

/* ------------------------------------------------------------------ small helpers */

let uid = 0
function nextId(prefix: string): string {
  uid += 1
  return `${prefix}-${uid}`
}

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  return node
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function nextFrame(fn: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => fn())
  else setTimeout(fn, 0)
}

function clamp01(value: number): number {
  if (!(value > 0)) return 0
  return value > 1 ? 1 : value
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (node) => !node.hidden && node.getAttribute('aria-hidden') !== 'true',
  )
}

/* ------------------------------------------------------------------ the stack */

interface ToastParts {
  root: HTMLElement
  kindLabel: HTMLElement
  title: HTMLElement
  message: HTMLElement
  meter: HTMLElement | null
  meterFill: HTMLElement | null
  actions: HTMLElement
  close: HTMLButtonElement | null
}

interface Toast {
  id: string
  kind: NotifyKind
  title: Message | null
  message: Message
  timeoutMs: number | null
  dismissible: boolean
  actions: NotifyAction[]
  isProgress: boolean
  fraction: number | null
  parts: ToastParts | null
  /** Milliseconds left before it expires; only meaningful while `timeoutMs` is a number. */
  remaining: number
  startedAt: number
  timer: number | null
  /** True once the countdown has begun, so a pause/resume cannot start it early. */
  started: boolean
  dismissed: boolean
}

let stackEl: HTMLElement | null = null
let queueEl: HTMLElement | null = null
let stackParent: HTMLElement | null = null
let paused = false
const visible: Toast[] = []
const waiting: Toast[] = []
let langUnsubscribe: (() => void) | null = null

/**
 * Put the stack somewhere other than `document.body` — `app.ts` calls this once so the
 * notifications live inside the shell root. Safe to call before anything is raised.
 */
export function mountNotifications(parent: HTMLElement): void {
  stackParent = parent
  if (stackEl && stackEl.parentElement !== parent) parent.appendChild(stackEl)
}

function stack(): HTMLElement {
  if (stackEl && stackEl.isConnected) return stackEl
  ensureStyles()
  const root = make('div', 'sh-notify-stack')
  root.id = 'sh-notify-stack'
  root.setAttribute('aria-label', t(key('notify.stackLabel')))
  root.setAttribute('role', 'region')

  const queue = make('p', 'sh-notify-queue')
  queue.setAttribute('role', 'status')
  root.appendChild(queue)

  root.addEventListener('pointerenter', () => pauseTimers())
  root.addEventListener('pointerleave', () => resumeTimers())
  root.addEventListener('focusin', () => pauseTimers())
  root.addEventListener('focusout', (event) => {
    const next = event.relatedTarget
    if (next instanceof Node && root.contains(next)) return
    resumeTimers()
  })

  const parent = stackParent ?? document.body
  parent.appendChild(root)
  stackEl = root
  queueEl = queue

  if (!langUnsubscribe) {
    langUnsubscribe = onLangChange(() => {
      root.setAttribute('aria-label', t(key('notify.stackLabel')))
      for (const toast of visible) renderToast(toast)
      renderQueueCount()
      renderOpenDialog()
    })
  }
  return root
}

function renderQueueCount(): void {
  if (!queueEl) return
  queueEl.textContent =
    waiting.length > 0 ? t(key('notify.queued'), { count: waiting.length }) : ''
}

function kindLabelKey(kind: NotifyKind): StringKey {
  return key(`notify.kind.${kind}`)
}

function buildToast(toast: Toast): ToastParts {
  const root = make('div', `sh-notify-toast sh-notify-toast--${toast.kind}`)
  root.id = toast.id
  root.setAttribute('role', toast.kind === 'failure' ? 'alert' : 'status')
  root.setAttribute('aria-live', toast.kind === 'failure' ? 'assertive' : 'polite')
  root.setAttribute('aria-atomic', 'true')
  root.dataset.kind = toast.kind

  const frame = make('div', 'sh-notify-toast__frame')
  const body = make('div', 'sh-notify-toast__body')
  const accent = make('span', 'sh-notify-toast__accent')
  accent.setAttribute('aria-hidden', 'true')

  const text = make('div', 'sh-notify-toast__text')
  const kindLabel = make('p', 'sh-notify-toast__kind')
  const title = make('p', 'sh-notify-toast__title')
  const message = make('p', 'sh-notify-toast__message')
  text.append(kindLabel, title, message)

  let meter: HTMLElement | null = null
  let meterFill: HTMLElement | null = null
  if (toast.isProgress) {
    meter = make('div', 'sh-notify-toast__meter')
    meter.setAttribute('role', 'progressbar')
    meter.setAttribute('aria-valuemin', '0')
    meter.setAttribute('aria-valuemax', '100')
    meterFill = make('span', 'sh-notify-toast__meter-fill')
    meter.appendChild(meterFill)
    text.appendChild(meter)
  }

  const actions = make('div', 'sh-notify-toast__actions')
  text.appendChild(actions)

  body.append(accent, text)

  let close: HTMLButtonElement | null = null
  if (toast.dismissible) {
    close = make('button', 'sh-notify-btn sh-notify-btn--close')
    close.type = 'button'
    close.textContent = '×'
    close.addEventListener('click', () => dismiss(toast))
    body.appendChild(close)
  }

  frame.appendChild(body)
  root.appendChild(frame)
  return { root, kindLabel, title, message, meter, meterFill, actions, close }
}

function renderToast(toast: Toast): void {
  const parts = toast.parts
  if (!parts) return

  parts.root.className = `sh-notify-toast sh-notify-toast--${toast.kind}`
  parts.root.dataset.kind = toast.kind
  parts.root.setAttribute('role', toast.kind === 'failure' ? 'alert' : 'status')
  parts.root.setAttribute('aria-live', toast.kind === 'failure' ? 'assertive' : 'polite')

  parts.kindLabel.textContent = t(kindLabelKey(toast.kind))
  if (toast.title) {
    parts.title.textContent = t(toast.title.key, toast.title.params)
    parts.title.hidden = false
  } else {
    parts.title.textContent = ''
    parts.title.hidden = true
  }
  parts.message.textContent = t(toast.message.key, toast.message.params)

  if (parts.meter && parts.meterFill) {
    const indeterminate = toast.fraction === null
    parts.meter.hidden = !toast.isProgress
    parts.meter.classList.toggle('sh-notify-toast__meter--busy', indeterminate)
    if (indeterminate) {
      parts.meter.removeAttribute('aria-valuenow')
      parts.meter.setAttribute('aria-valuetext', t(key('notify.progressBusy')))
      parts.meterFill.style.width = ''
    } else {
      const percent = Math.round(clamp01(toast.fraction ?? 0) * 100)
      parts.meter.setAttribute('aria-valuenow', String(percent))
      parts.meter.setAttribute('aria-valuetext', t(key('notify.progressPercent'), { percent }))
      parts.meterFill.style.width = `${percent}%`
    }
    parts.meter.setAttribute('aria-label', t(toast.message.key, toast.message.params))
  }

  if (parts.close) parts.close.setAttribute('aria-label', t(key('notify.dismiss')))

  parts.actions.replaceChildren()
  for (const action of toast.actions) {
    const button = make('button', 'sh-notify-btn')
    button.type = 'button'
    button.textContent = t(action.labelKey, action.params)
    button.addEventListener('click', () => {
      try {
        action.run()
      } finally {
        if (action.dismiss !== false) dismiss(toast)
      }
    })
    parts.actions.appendChild(button)
  }
  parts.actions.hidden = toast.actions.length === 0
}

function show(toast: Toast): void {
  const root = stack()
  const parts = buildToast(toast)
  toast.parts = parts
  root.appendChild(parts.root)
  visible.push(toast)
  // Insert first, fill next frame: that is what makes a live region announce.
  nextFrame(() => {
    if (toast.dismissed) return
    renderToast(toast)
    startTimer(toast)
  })
}

function pump(): void {
  while (visible.length < MAX_VISIBLE && waiting.length > 0) {
    const next = waiting.shift()
    if (!next || next.dismissed) continue
    show(next)
  }
  renderQueueCount()
}

function startTimer(toast: Toast): void {
  stopTimer(toast)
  if (!toast.parts || toast.timeoutMs === null || toast.dismissed) {
    toast.started = false
    return
  }
  toast.started = true
  toast.remaining = toast.timeoutMs
  if (paused) return
  toast.startedAt = now()
  toast.timer = window.setTimeout(() => dismiss(toast), toast.remaining)
}

function stopTimer(toast: Toast): void {
  if (toast.timer !== null) {
    window.clearTimeout(toast.timer)
    toast.timer = null
  }
}

function pauseTimers(): void {
  if (paused) return
  paused = true
  const at = now()
  for (const toast of visible) {
    if (toast.timer === null) continue
    toast.remaining = Math.max(0, toast.remaining - (at - toast.startedAt))
    stopTimer(toast)
  }
}

function resumeTimers(): void {
  if (!paused) return
  paused = false
  for (const toast of visible) {
    if (!toast.started || toast.timeoutMs === null || toast.dismissed) continue
    toast.startedAt = now()
    toast.timer = window.setTimeout(() => dismiss(toast), Math.max(50, toast.remaining))
  }
}

/**
 * Focus must never be dropped on the floor. If the toast being removed holds focus,
 * hand it to a neighbouring toast's dismiss button before the node goes away.
 */
function rehomeFocus(toast: Toast): void {
  const parts = toast.parts
  const active = document.activeElement
  if (!parts || !(active instanceof HTMLElement) || !parts.root.contains(active)) return
  const index = visible.indexOf(toast)
  const neighbours = [visible[index + 1], visible[index - 1]]
  for (const neighbour of neighbours) {
    const button = neighbour?.parts?.close
    if (button) {
      button.focus()
      return
    }
  }
  active.blur()
}

function dismiss(toast: Toast): void {
  if (toast.dismissed) return
  toast.dismissed = true
  stopTimer(toast)
  rehomeFocus(toast)
  const index = visible.indexOf(toast)
  if (index >= 0) visible.splice(index, 1)
  const queuedIndex = waiting.indexOf(toast)
  if (queuedIndex >= 0) waiting.splice(queuedIndex, 1)
  toast.parts?.root.remove()
  toast.parts = null
  pump()
}

function handleFor(toast: Toast): NotifyHandle {
  return {
    id: toast.id,
    update: (patch) => applyPatch(toast, patch),
    dismiss: () => dismiss(toast),
    isOpen: () => !toast.dismissed,
  }
}

function applyPatch(toast: Toast, patch: NotifyPatch): void {
  if (toast.dismissed) return
  let timingChanged = false
  if (patch.kind !== undefined && patch.kind !== toast.kind) {
    toast.kind = patch.kind
    toast.isProgress = patch.kind === 'progress'
  }
  if (patch.titleKey !== undefined) {
    toast.title =
      patch.titleKey === null ? null : { key: patch.titleKey, params: patch.titleParams }
  } else if (patch.titleParams !== undefined && toast.title) {
    toast.title = { key: toast.title.key, params: patch.titleParams }
  }
  if (patch.messageKey !== undefined) {
    toast.message = { key: patch.messageKey, params: patch.params }
  } else if (patch.params !== undefined) {
    toast.message = { key: toast.message.key, params: patch.params }
  }
  if (patch.fraction !== undefined) toast.fraction = patch.fraction
  if (patch.actions !== undefined) toast.actions = patch.actions
  if (patch.timeoutMs !== undefined) {
    toast.timeoutMs = patch.timeoutMs
    timingChanged = true
  }
  renderToast(toast)
  if (timingChanged) startTimer(toast)
}

function findLive(id: string): Toast | undefined {
  return visible.find((toast) => toast.id === id) ?? waiting.find((toast) => toast.id === id)
}

function raise(init: NotifyInit, isProgress: boolean, fraction: number | null): Toast {
  const kind: NotifyKind = init.kind ?? (isProgress ? 'progress' : 'info')
  const existing = init.id ? findLive(init.id) : undefined
  if (existing) {
    applyPatch(existing, {
      kind,
      titleKey: init.titleKey ?? null,
      titleParams: init.titleParams,
      messageKey: init.messageKey,
      params: init.params,
      timeoutMs: init.timeoutMs !== undefined ? init.timeoutMs : DEFAULT_TIMEOUT[kind],
      fraction,
      actions: init.actions ?? [],
    })
    return existing
  }

  const toast: Toast = {
    id: init.id ?? nextId('sh-toast'),
    kind,
    title: init.titleKey ? { key: init.titleKey, params: init.titleParams } : null,
    message: { key: init.messageKey, params: init.params },
    timeoutMs: init.timeoutMs !== undefined ? init.timeoutMs : DEFAULT_TIMEOUT[kind],
    dismissible: init.dismissible ?? !isProgress,
    actions: init.actions ?? [],
    isProgress,
    fraction,
    parts: null,
    remaining: 0,
    startedAt: 0,
    timer: null,
    started: false,
    dismissed: false,
  }

  if (visible.length < MAX_VISIBLE) {
    show(toast)
  } else {
    waiting.push(toast)
    while (waiting.length > MAX_QUEUED) waiting.shift()
    renderQueueCount()
  }
  return toast
}

/* ------------------------------------------------------------------ public stack API */

/** Raise a notification. Never takes focus; never blocks. */
export function notify(init: NotifyInit): NotifyHandle {
  return handleFor(raise(init, false, null))
}

export function info(
  messageKey: StringKey,
  params?: Record<string, string | number>,
): NotifyHandle {
  return notify({ kind: 'info', messageKey, params })
}

export function success(
  messageKey: StringKey,
  params?: Record<string, string | number>,
): NotifyHandle {
  return notify({ kind: 'success', messageKey, params })
}

export function warn(
  messageKey: StringKey,
  params?: Record<string, string | number>,
): NotifyHandle {
  return notify({ kind: 'warning', messageKey, params })
}

/** A failure. `role="alert"`, and it stays until the reader dismisses it. */
export function fail(
  messageKey: StringKey,
  params?: Record<string, string | number>,
): NotifyHandle {
  return notify({ kind: 'failure', messageKey, params, timeoutMs: null })
}

/** A progress notification the caller drives and then resolves. */
export function progress(init: ProgressInit): ProgressHandle {
  const toast = raise(
    {
      id: init.id,
      kind: 'progress',
      titleKey: init.titleKey,
      titleParams: init.titleParams,
      messageKey: init.messageKey,
      params: init.params,
      timeoutMs: null,
      dismissible: init.dismissible ?? false,
    },
    true,
    init.fraction ?? null,
  )
  const base = handleFor(toast)
  return {
    id: base.id,
    update: base.update,
    dismiss: base.dismiss,
    isOpen: base.isOpen,
    set: (fraction, messageKey, params) => {
      const patch: NotifyPatch = { fraction }
      if (messageKey !== undefined) {
        patch.messageKey = messageKey
        patch.params = params
      }
      applyPatch(toast, patch)
    },
    succeed: (messageKey, params) => {
      toast.isProgress = false
      applyPatch(toast, {
        kind: 'success',
        messageKey,
        params,
        fraction: 1,
        timeoutMs: DEFAULT_TIMEOUT.success,
      })
      toast.dismissible = true
      if (toast.parts && !toast.parts.close) rebuild(toast)
    },
    fail: (messageKey, params) => {
      toast.isProgress = false
      applyPatch(toast, { kind: 'failure', messageKey, params, timeoutMs: null })
      toast.dismissible = true
      if (toast.parts && !toast.parts.close) rebuild(toast)
    },
  }
}

/** Swap a live toast's DOM in place — used when it gains a dismiss button. */
function rebuild(toast: Toast): void {
  const old = toast.parts
  if (!old) return
  const parts = buildToast(toast)
  toast.parts = parts
  old.root.replaceWith(parts.root)
  renderToast(toast)
}

/** Close everything, visible and queued. */
export function dismissAll(): void {
  for (const toast of [...visible, ...waiting]) dismiss(toast)
}

/** How many notifications are on screen right now. */
export function visibleCount(): number {
  return visible.length
}

/** How many are waiting for room. */
export function queuedCount(): number {
  return waiting.length
}

/* ------------------------------------------------------------------ confirm() */

interface OpenDialog {
  init: ConfirmInit
  titleEl: HTMLElement
  messageEl: HTMLElement
  hintEl: HTMLElement | null
  confirmEl: HTMLButtonElement
  cancelEl: HTMLButtonElement
}

let openDialog: OpenDialog | null = null

/** True while the one blocking dialog is on screen. */
export function isBlockingDialogOpen(): boolean {
  return openDialog !== null
}

function renderOpenDialog(): void {
  const dialog = openDialog
  if (!dialog) return
  const { init } = dialog
  dialog.titleEl.textContent = t(init.titleKey, init.titleParams)
  dialog.messageEl.textContent = t(init.messageKey, init.params)
  const confirmLabel = t(init.confirmKey ?? key('notify.confirm.ok'), init.confirmParams)
  dialog.confirmEl.textContent = confirmLabel
  dialog.cancelEl.textContent = t(init.cancelKey ?? key('notify.confirm.cancel'))
  if (dialog.hintEl) {
    dialog.hintEl.textContent = t(key('notify.confirm.destructiveHint'), { action: confirmLabel })
  }
}

/** Confirmations queue rather than stack: two dialogs at once is never right. */
let confirmChain: Promise<unknown> = Promise.resolve()

/**
 * The only blocking dialog in the application. Focus-trapped, Esc cancels, focus
 * returns where it came from. Enter confirms — except when `destructive`, where the
 * confirming button must be activated explicitly (clicked, or focused and pressed) so
 * a stray Enter can never delete anything.
 */
export function confirm(init: ConfirmInit): Promise<boolean> {
  const result = confirmChain.then(() => showConfirm(init))
  confirmChain = result.catch(() => undefined)
  return result
}

function showConfirm(init: ConfirmInit): Promise<boolean> {
  ensureStyles()
  return new Promise<boolean>((resolve) => {
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const overlay = make('div', 'sh-notify-modal')
    const panel = make('div', 'sh-notify-dialog')
    const frame = make('div', 'sh-notify-dialog__frame')
    const body = make('div', 'sh-notify-dialog__body')

    const titleEl = make('h2', 'sh-notify-dialog__title')
    titleEl.id = nextId('sh-confirm-title')
    const messageEl = make('p', 'sh-notify-dialog__message')
    messageEl.id = nextId('sh-confirm-message')

    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-modal', 'true')
    panel.setAttribute('aria-labelledby', titleEl.id)
    panel.setAttribute('aria-describedby', messageEl.id)

    let hintEl: HTMLElement | null = null
    if (init.destructive) {
      hintEl = make('p', 'sh-notify-dialog__hint')
      hintEl.id = nextId('sh-confirm-hint')
      panel.setAttribute('aria-describedby', `${messageEl.id} ${hintEl.id}`)
    }

    const actions = make('div', 'sh-notify-dialog__actions')
    const cancelEl = make('button', 'sh-notify-btn')
    cancelEl.type = 'button'
    const confirmEl = make(
      'button',
      init.destructive ? 'sh-notify-btn sh-notify-btn--danger' : 'sh-notify-btn',
    )
    confirmEl.type = 'button'
    actions.append(cancelEl, confirmEl)

    body.append(titleEl, messageEl)
    if (hintEl) body.appendChild(hintEl)
    body.appendChild(actions)
    frame.appendChild(body)
    panel.appendChild(frame)
    overlay.appendChild(panel)

    let settled = false
    const finish = (value: boolean): void => {
      if (settled) return
      settled = true
      document.removeEventListener('focusin', keepFocus, true)
      overlay.remove()
      openDialog = null
      if (returnTo && returnTo.isConnected) returnTo.focus()
      resolve(value)
    }

    function keepFocus(event: FocusEvent): void {
      const target = event.target
      if (target instanceof Node && panel.contains(target)) return
      const first = focusableIn(panel)[0]
      if (first) first.focus()
    }

    overlay.addEventListener('pointerdown', (event) => {
      // A click outside is not an answer: keep the dialog, put focus back inside.
      if (event.target === overlay) {
        event.preventDefault()
        const first = focusableIn(panel)[0]
        if (first) first.focus()
      }
    })

    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        finish(false)
        return
      }
      if (event.key === 'Tab') {
        const items = focusableIn(panel)
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        const active = document.activeElement
        if (event.shiftKey && (active === first || !panel.contains(active))) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && active === last) {
          event.preventDefault()
          first.focus()
        }
        return
      }
      if (event.key === 'Enter' && !init.destructive) {
        // Buttons answer for themselves; this is Enter pressed anywhere else.
        if (event.target instanceof HTMLButtonElement) return
        event.preventDefault()
        finish(true)
      }
    })

    cancelEl.addEventListener('click', () => finish(false))
    confirmEl.addEventListener('click', () => finish(true))

    document.body.appendChild(overlay)
    openDialog = { init, titleEl, messageEl, hintEl, confirmEl, cancelEl }
    renderOpenDialog()
    document.addEventListener('focusin', keepFocus, true)
    // A destructive question opens with the safe answer under the cursor.
    if (init.destructive) cancelEl.focus()
    else confirmEl.focus()
  })
}
