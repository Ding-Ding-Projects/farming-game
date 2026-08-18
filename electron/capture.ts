/**
 * Screenshot mode: `electron . --capture [--capture-out=DIR]`.
 *
 * Why this lives inside the real main process instead of a standalone script:
 * a separate Electron entry point never got a renderer started on an off-screen
 * Win32 desktop, and Win32 `PrintWindow` returns solid black for Chromium because
 * the page is composited on a surface the OS cannot read back. Running as the app
 * itself gives a renderer that genuinely paints, and reading `canvas.toDataURL()`
 * gets the pixels without asking the OS for them at all.
 *
 * Off by default and inert unless the flag is passed, so a normal launch is
 * untouched.
 */
import { app } from 'electron'
import type { BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

export const CAPTURE_FLAG = '--capture'

export function wantsCapture(argv: readonly string[]): boolean {
  return argv.includes(CAPTURE_FLAG)
}

function outputDir(argv: readonly string[]): string {
  const flag = argv.find((a) => a.startsWith('--capture-out='))
  if (flag) return flag.slice('--capture-out='.length)
  return path.join(app.getPath('userData'), 'screenshots')
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function log(dir: string, line: string): void {
  try {
    fs.appendFileSync(path.join(dir, 'capture.log'), `${line}\n`)
  } catch {
    // The log is a convenience; losing it must not abort the capture.
  }
  process.stdout.write(`${line}\n`)
}

/**
 * Reads the game canvas out of the page. Also reports the pixel range, because a
 * PNG of a uniformly black canvas is a failed capture that looks like a file.
 */
const READ_CANVAS = `
  (() => {
    const c = document.querySelector('canvas#game') || document.querySelector('canvas')
    if (!c) return { ok: false, why: 'no canvas; body=' + document.body.innerHTML.slice(0, 300) }
    const g = c.getContext('2d')
    let min = 255, max = 0
    try {
      const d = g.getImageData(0, 0, c.width, c.height).data
      for (let i = 0; i < d.length; i += 4 * 31) {
        if (d[i] < min) min = d[i]
        if (d[i] > max) max = d[i]
      }
    } catch (e) { return { ok: false, why: 'getImageData: ' + e } }
    return { ok: true, url: c.toDataURL('image/png'), w: c.width, h: c.height, min, max }
  })()
`

interface CanvasRead {
  ok: boolean
  why?: string
  url?: string
  w?: number
  h?: number
  min?: number
  max?: number
}

/**
 * `executeJavaScript` queues behind document load, and on a GPU-less off-screen
 * desktop that load can never complete — so an unguarded call hangs the whole run
 * instead of failing one step. Race it.
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ])
}

async function shot(win: BrowserWindow, dir: string, name: string): Promise<void> {
  let read: CanvasRead
  try {
    read = (await withTimeout(
      win.webContents.executeJavaScript(READ_CANVAS),
      8000,
      'executeJavaScript',
    )) as CanvasRead
  } catch (err) {
    log(dir, `${name}: ${String(err)}`)
    return
  }

  if (!read.ok || !read.url) {
    log(dir, `${name}: FAILED ${read.why ?? 'unknown'}`)
    return
  }

  const buf = Buffer.from(read.url.slice('data:image/png;base64,'.length), 'base64')
  fs.writeFileSync(path.join(dir, `${name}.png`), buf)
  const flat = (read.max ?? 0) - (read.min ?? 0) < 4
  log(
    dir,
    `${name}: ${read.w}x${read.h} ${buf.length}b range=${read.min}..${read.max}` +
      (flat ? '  <-- FLAT, nothing was drawn' : ''),
  )
}

async function press(win: BrowserWindow, keyCode: string, times = 1): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    if (keyCode.length === 1) win.webContents.sendInputEvent({ type: 'char', keyCode })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode })
    await sleep(350)
  }
}

/**
 * Holds a key down for a while, then releases it.
 *
 * Movement reads *held* keys — `world.ts` asks `input.down('ArrowLeft')` every frame — so
 * a keyDown immediately followed by a keyUp can pass between two frames and move nobody.
 * That is why the farm frames in this script showed a farmer who had not walked anywhere:
 * every movement step was a tap. One tile takes `MOVE_MS` (180ms), so the default here is
 * comfortably longer than that.
 */
async function hold(win: BrowserWindow, keyCode: string, ms = 420): Promise<void> {
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode })
  await sleep(ms)
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode })
  await sleep(220)
}

/** Drives the game through a short scripted session, photographing as it goes. */
export async function runCapture(win: BrowserWindow, argv: readonly string[]): Promise<void> {
  const dir = outputDir(argv)
  fs.mkdirSync(dir, { recursive: true })
  try {
    fs.writeFileSync(path.join(dir, 'capture.log'), '')
  } catch {
    // Non-fatal; log() will simply append to whatever is there.
  }

  // Never let a stuck page hold the process open forever.
  const watchdog = setTimeout(() => {
    log(dir, 'WATCHDOG: capture exceeded 300s')
    app.exit(2)
  }, 300_000)

  const wc = win.webContents
  wc.on('dom-ready', () => log(dir, '  [dom-ready]'))
  wc.on('did-finish-load', () => log(dir, '  [did-finish-load]'))
  wc.on('did-stop-loading', () => log(dir, '  [did-stop-loading]'))
  wc.on('did-fail-load', (_e, code, desc, url) => log(dir, `  [did-fail-load] ${code} ${desc} ${url}`))
  wc.on('preload-error', (_e, p, err) => log(dir, `  [preload-error] ${p} ${String(err)}`))
  wc.on('console-message', (_e, _l, message) => log(dir, `  [page] ${message}`))
  wc.on('render-process-gone', (_e, d) => log(dir, `  [render-gone] ${JSON.stringify(d)}`))

  log(dir, `capture -> ${dir}`)
  log(dir, `  loading=${wc.isLoading()} crashed=${wc.isCrashed()} url=${wc.getURL()}`)

  // Software rasterisation on an off-screen desktop is slow — the document can take
  // the better part of a minute to become ready. Wait for the event rather than
  // guessing a delay, and report how long it actually took.
  const startedAt = Date.now()
  await new Promise<void>((resolve) => {
    if (!wc.isLoading() && wc.getURL() !== '') {
      resolve()
      return
    }
    const done = (): void => {
      clearInterval(poll)
      resolve()
    }
    wc.once('dom-ready', done)
    const poll = setInterval(() => {
      if (Date.now() - startedAt > 90_000) done()
    }, 1000)
  })
  log(dir, `  document ready after ${Date.now() - startedAt}ms, loading=${wc.isLoading()}`)

  // Let the shell boot, the save load and the title scene settle.
  await sleep(6000)

  await shot(win, dir, '01-title')

  // Title screen: NEW FARM. Focus starts on the first enabled control; CONTINUE is
  // disabled without a save, so one Enter fires NEW FARM, and a second clears the
  // confirmation if one appears.
  await press(win, 'Enter')
  await sleep(2000)
  await shot(win, dir, '02-title-action')
  await press(win, 'Enter')
  await sleep(2500)
  await shot(win, dir, '03-farm')

  await hold(win, 'Right', 700)
  await hold(win, 'Down')
  await sleep(600)
  await shot(win, dir, '04-farm-walked')

  // Till, then plant, so the world is not all untouched grass.
  await press(win, '1')
  await press(win, 'Space')
  await sleep(500)
  await shot(win, dir, '05-tilled')

  await press(win, 'b')
  await sleep(1800)
  await shot(win, dir, '06-shop')
  await press(win, 'Escape')
  await sleep(600)

  await press(win, 'i')
  await sleep(1500)
  await shot(win, dir, '07-bag')
  await press(win, 'Escape')
  await sleep(600)

  await press(win, 'h')
  await sleep(1500)
  await shot(win, dir, '08-help')
  await press(win, 'Escape')
  await sleep(600)

  await press(win, 'n')
  await sleep(2500)
  await shot(win, dir, '09-morning')

  clearTimeout(watchdog)
  log(dir, 'done')
  app.exit(0)
}
