#!/usr/bin/env node
/**
 * Proves the application mark is real, is multi-resolution, and actually reached the
 * executable the user downloads.
 *
 * A packaging config that *names* an icon proves nothing: electron-builder will happily
 * warn and carry on with the framework default, and the resulting installer looks correct
 * in CI while shipping somebody else's mark. So this checks two separate things:
 *
 *   1. `build/icon.ico` exists, is a well-formed ICO, and carries every size a Windows
 *      shell asks for — including 16 and 32, which is where an icon is seen most and
 *      where a single large image resampled down turns to mud.
 *   2. When given a built executable, the 256 px image's exact bytes are found inside it.
 *      electron-builder embeds the ICO's PNG payloads verbatim as an icon resource, so
 *      finding those bytes is proof the mark reached the artifact, not just the config.
 *
 * Usage:
 *   node scripts/check-icon.mjs
 *   node scripts/check-icon.mjs release/squirrel-windows/"Sprout Hollow-Setup-1.3.0.exe"
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

/** Sizes the Windows shell asks for. 16 and 32 are the ones a user sees all day. */
const REQUIRED = [16, 24, 32, 48, 64, 128, 256]
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const icoPath = path.join(process.cwd(), 'build', 'icon.ico')
const fail = (message) => {
  console.error(`icon check failed: ${message}`)
  process.exit(1)
}

if (!fs.existsSync(icoPath)) {
  fail('build/icon.ico is missing. Run `npm run icon` (packaging does this for you).')
}

const ico = fs.readFileSync(icoPath)
if (ico.length < 22) fail('build/icon.ico is too small to be an icon.')
if (ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1) {
  fail('build/icon.ico does not have an ICO header.')
}

const count = ico.readUInt16LE(4)
const found = new Map()
let largest = null

for (let i = 0; i < count; i += 1) {
  const entry = 6 + i * 16
  const width = ico[entry] === 0 ? 256 : ico[entry]
  const height = ico[entry + 1] === 0 ? 256 : ico[entry + 1]
  const bytes = ico.readUInt32LE(entry + 8)
  const offset = ico.readUInt32LE(entry + 12)

  if (width !== height) fail(`entry ${i} is ${width}x${height}; icons must be square.`)
  if (offset + bytes > ico.length) fail(`entry ${i} points past the end of the file.`)

  const image = ico.subarray(offset, offset + bytes)
  if (!image.subarray(0, 8).equals(PNG_MAGIC)) {
    fail(`entry ${i} (${width}px) is not a PNG payload.`)
  }
  if (bytes < 64) fail(`entry ${i} (${width}px) is ${bytes} bytes; that is not a drawing.`)

  found.set(width, image)
  if (largest === null || width > largest.width) largest = { width, image }
}

const missing = REQUIRED.filter((size) => !found.has(size))
if (missing.length > 0) fail(`build/icon.ico is missing sizes: ${missing.join(', ')}`)

console.log(`build/icon.ico: ${count} sizes (${[...found.keys()].sort((a, b) => a - b).join(', ')}), all PNG`)

/* ------------------------------------------------------- the built artifact */

const target = process.argv[2]
if (target === undefined) {
  console.log('No executable given; skipped the built-artifact check.')
  process.exit(0)
}

if (!fs.existsSync(target)) fail(`no such file: ${target}`)
if (largest === null) fail('no image to look for.')

const exe = fs.readFileSync(target)
if (exe.indexOf(largest.image) < 0) {
  fail(
    `${path.basename(target)} does not contain the ${largest.width}px mark. ` +
      'The packaged executable is carrying a different icon — most likely the framework default.',
  )
}

console.log(
  `${path.basename(target)}: carries the ${largest.width}px mark ` +
    `(${largest.image.length} bytes found at offset ${exe.indexOf(largest.image)})`,
)
