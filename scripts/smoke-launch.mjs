#!/usr/bin/env node
/**
 * Starts the real application and fails if it does not come up.
 *
 * This exists because of a bug that shipped in four consecutive releases: the packaged
 * app installed cleanly, launched, ran four processes — and never showed a window. The
 * renderer wedged in a synchronous re-entrant loop between the settings panel and the
 * store, so no timer, no animation frame and not even the page's own load event ever ran
 * again. Every automated check was green the whole time, because not one of them started
 * the application. 997 tests and 33 captures all exercised modules; nothing exercised the
 * program.
 *
 * So this launches Electron the way a player does, against the built output, and requires
 * it to reach a rendered frame. It uses the app's own `--capture` mode rather than a
 * bespoke harness: that path loads the same `dist/index.html`, boots the same shell, runs
 * the same game loop, and writes PNGs off the real canvas. If the renderer wedges, no
 * frames appear and this exits non-zero.
 *
 *   npm run smoke
 *
 * A frame is proof of a great deal at once: the main process started, the page loaded,
 * every module evaluated, the shell booted, the canvas mounted and the loop ran.
 */
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const root = process.cwd()
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sprout-smoke-'))

/** The built entry has to exist, or this would "pass" by testing nothing. */
for (const required of ['dist/index.html', 'dist-electron/main.js']) {
  if (!fs.existsSync(path.join(root, required))) {
    console.error(`smoke failed: ${required} is missing. Run \`npm run build\` first.`)
    process.exit(1)
  }
}

/**
 * Where Electron actually is.
 *
 * The `electron` package's main export *is* the path to the binary when it is imported
 * from Node rather than from inside Electron, which is the only resolution that survives
 * a hoisted or relocated `node_modules`. The hard-coded path is kept as a fallback for a
 * layout where the import is unavailable.
 */
async function electronBinary() {
  try {
    const mod = await import('electron')
    const resolved = typeof mod.default === 'string' ? mod.default : null
    if (resolved !== null && fs.existsSync(resolved)) return resolved
  } catch {
    // Fall through to the conventional location.
  }
  const guess = path.join(
    root,
    'node_modules',
    'electron',
    'dist',
    process.platform === 'win32' ? 'electron.exe' : 'electron',
  )
  return fs.existsSync(guess) ? guess : null
}

let electron = await electronBinary()

if (electron === null) {
  // `npm ci` can leave the package present with its binary absent — a skipped or failed
  // postinstall does exactly that, and `ELECTRON_SKIP_BINARY_DOWNLOAD` is tested for
  // truthiness, so even "0" skips the download. Fetching it once here is cheap next to a
  // release that silently stops checking whether the application starts.
  console.log('The Electron binary is missing; running `npm rebuild electron` once.')
  const rebuild = spawnSync('npm', ['rebuild', 'electron'], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: process.platform === 'win32',
    timeout: 600_000,
  })
  if (rebuild.status !== 0) console.log(`npm rebuild electron exited ${rebuild.status}`)
  electron = await electronBinary()
}

if (electron === null) {
  console.error(
    'smoke failed: the Electron binary is not installed and could not be fetched.\n' +
      'This job needs the real binary. Check that ELECTRON_SKIP_BINARY_DOWNLOAD is empty\n' +
      'for it — the variable is tested for truthiness, so even "0" skips the download.',
  )
  process.exit(1)
}

console.log(`Electron: ${electron}`)

console.log(`Launching the application, writing frames to ${out}`)
// A clean profile per run. Without it the app finds whatever save this machine happens
// to hold, CONTINUE lights up, and the scripted session loads someone's half-played farm
// instead of starting a new one — which is both non-deterministic and, the first time it
// happened here, quietly wrong in a way that looked like a real failure. It also means a
// smoke run never touches the player's own save.
const profile = path.join(out, 'profile')
const run = spawnSync(
  electron,
  ['.', '--capture', `--capture-out=${out}`, `--user-data-dir=${profile}`],
  {
    cwd: root,
    encoding: 'utf8',
    timeout: 180_000,
    // A hung renderer must not hang the build; the timeout above is the real guard.
    killSignal: 'SIGKILL',
  },
)

if (run.stdout) process.stdout.write(run.stdout)
if (run.stderr) process.stderr.write(run.stderr)

if (run.error !== undefined) {
  console.error(`smoke failed: could not start the application — ${run.error.message}`)
  process.exit(1)
}

const frames = fs.existsSync(out) ? fs.readdirSync(out).filter((f) => f.endsWith('.png')) : []

/**
 * The bar is deliberately "more than one frame". The wedge this guards against produced
 * zero, and a build that draws the title screen but dies entering the farm would produce
 * one — so a single frame is not evidence the application works.
 */
if (frames.length < 2) {
  console.error(
    `\nsmoke failed: the application produced ${frames.length} frame(s).\n` +
      'It started but never rendered. This is the shape of a wedged renderer: the process\n' +
      'is alive, the window never appears, and nothing on the main thread runs again.',
  )
  process.exit(1)
}

// A frame that is one flat colour is a window that painted nothing.
let smallest = Infinity
for (const frame of frames) {
  const size = fs.statSync(path.join(out, frame)).size
  if (size < smallest) smallest = size
}
if (smallest < 2000) {
  console.error(`\nsmoke failed: the smallest frame is ${smallest} bytes, which is a blank window.`)
  process.exit(1)
}

console.log(`\nsmoke passed: ${frames.length} frames rendered, smallest ${smallest} bytes.`)
fs.rmSync(out, { recursive: true, force: true })
