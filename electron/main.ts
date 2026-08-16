import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

/** 4x the 320x224 logical framebuffer, and 2x as the floor. */
const WINDOW_W = 1280
const WINDOW_H = 896
const MIN_W = 640
const MIN_H = 448

/** PAL.ink — the letterbox colour, so the window never flashes white. */
const INK = '#1b1a24'

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
].join('; ')

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL ?? ''

/** Generous ceiling on an incoming save. A full farm serialises to a fraction of this. */
const MAX_SAVE_BYTES = 4 * 1024 * 1024

function saveFile(): string {
  return path.join(app.getPath('userData'), 'save.json')
}

async function readSaveFile(): Promise<string | null> {
  try {
    const text = await fs.promises.readFile(saveFile(), 'utf8')
    return text.length > 0 ? text : null
  } catch {
    return null
  }
}

/** Writes through a temp file so a crash mid-write cannot leave a half-written save. */
async function writeSaveFile(json: string): Promise<boolean> {
  const file = saveFile()
  const temp = `${file}.tmp`
  try {
    await fs.promises.mkdir(path.dirname(file), { recursive: true })
    await fs.promises.writeFile(temp, json, 'utf8')
    await fs.promises.rename(temp, file)
    return true
  } catch {
    try {
      await fs.promises.rm(temp, { force: true })
    } catch {
      // Nothing to clean up, or the disk is refusing us entirely. Either way, report failure.
    }
    return false
  }
}

async function clearSaveFile(): Promise<boolean> {
  try {
    await fs.promises.rm(saveFile(), { force: true })
    return true
  } catch {
    return false
  }
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

/** True only for the page this app actually serves: the dev server, or a local file. */
function isAppUrl(raw: string): boolean {
  const url = parseUrl(raw)
  if (!url) return false
  if (DEV_SERVER_URL) {
    const dev = parseUrl(DEV_SERVER_URL)
    return dev !== null && url.origin === dev.origin
  }
  return url.protocol === 'file:'
}

function openExternally(raw: string): void {
  const url = parseUrl(raw)
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) return
  shell.openExternal(raw).catch(() => undefined)
}

function harden(contents: WebContents): void {
  contents.setWindowOpenHandler(({ url }) => {
    openExternally(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return
    event.preventDefault()
    openExternally(url)
  })
  contents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })
}

/**
 * Tells the renderer the window's maximised state changed, so the title bar's
 * maximise button can follow a double-click, a drag to the top edge, or the OS
 * doing it for us. Sent on both `maximize` and `unmaximize`.
 */
function pushMaximizedState(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  win.webContents.send('window:maximized-changed', win.isMaximized())
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: WINDOW_W,
    height: WINDOW_H,
    minWidth: MIN_W,
    minHeight: MIN_H,
    useContentSize: true,
    backgroundColor: INK,
    title: 'Sprout Hollow',
    // Frameless: src/shell/ui/titlebar.ts draws the bar and owns the controls.
    frame: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: false,
    },
  })

  win.once('ready-to-show', () => win.show())
  win.setMenuBarVisibility(false)
  win.on('maximize', () => pushMaximizedState(win))
  win.on('unmaximize', () => pushMaximizedState(win))
  harden(win.webContents)

  if (DEV_SERVER_URL) {
    win.loadURL(DEV_SERVER_URL).catch(() => undefined)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html')).catch(() => undefined)
  }
}

function registerSaveHandlers(): void {
  ipcMain.handle('save:read', () => readSaveFile())
  ipcMain.handle('save:write', (_event, json: unknown) => {
    if (typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > MAX_SAVE_BYTES) {
      return Promise.resolve(false)
    }
    return writeSaveFile(json)
  })
  ipcMain.handle('save:clear', () => clearSaveFile())
}

/** The window that asked, or null if it has already gone away mid-call. */
function senderWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  const win = BrowserWindow.fromWebContents(event.sender)
  return win !== null && !win.isDestroyed() ? win : null
}

/**
 * The four channels behind the custom title bar. Each one acts on the window that
 * asked, never on a window it was handed, so a renderer cannot reach another window.
 */
function registerWindowHandlers(): void {
  ipcMain.handle('window:minimize', (event: IpcMainInvokeEvent) => {
    const win = senderWindow(event)
    if (win !== null && win.isMinimizable()) win.minimize()
  })

  ipcMain.handle('window:maximize', (event: IpcMainInvokeEvent) => {
    const win = senderWindow(event)
    if (win === null) return false
    if (win.isMaximized()) win.unmaximize()
    else if (win.isMaximizable()) win.maximize()
    return win.isMaximized()
  })

  ipcMain.handle('window:close', (event: IpcMainInvokeEvent) => {
    const win = senderWindow(event)
    if (win !== null) win.close()
  })

  ipcMain.handle('window:isMaximized', (event: IpcMainInvokeEvent) => {
    const win = senderWindow(event)
    return win !== null && win.isMaximized()
  })
}

function applySecurityHeaders(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers: Record<string, string | string[]> = { ...(details.responseHeaders ?? {}) }
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'content-security-policy') delete headers[key]
    }
    headers['Content-Security-Policy'] = [CSP]
    callback({ responseHeaders: headers })
  })
  // The game needs no camera, microphone, geolocation or notifications. Ever.
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, done) => done(false))
}

app.whenReady().then(
  () => {
    applySecurityHeaders()
    registerSaveHandlers()
    registerWindowHandlers()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  },
  () => app.quit(),
)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
