#!/usr/bin/env node
/**
 * Copies every rendered screenshot from `docs/shots/` into `site/shots/`.
 *
 * The website needs the images inside its own build root, so there have always been two
 * copies. They were kept in step by hand, which meant they were not: `site/shots/` was
 * carrying five of the nine frames, and three of those were from a resolution the game
 * had already moved on from. A stale screenshot on a download page is a promise the
 * download does not keep.
 *
 * So the copy is made by a script now, and the script is the only way it is made. It runs
 * as part of `npm run shots`, straight after the renderer writes the PNGs.
 *
 * It deletes any PNG in `site/shots/` that `docs/shots/` no longer has, because a frame
 * that has been renamed or dropped must not linger on the website under its old name.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

const root = process.cwd()
const from = path.join(root, 'docs', 'shots')
const to = path.join(root, 'site', 'shots')

if (!fs.existsSync(from)) {
  console.error(`No ${path.relative(root, from)}. Render the shots first:`)
  console.error('  SHOTS=1 npx vitest run tests/shots.test.ts')
  process.exit(1)
}

const wanted = fs
  .readdirSync(from)
  .filter((name) => name.toLowerCase().endsWith('.png'))
  .sort()

if (wanted.length === 0) {
  console.error(`${path.relative(root, from)} holds no PNGs. Nothing to publish.`)
  process.exit(1)
}

fs.mkdirSync(to, { recursive: true })

let copied = 0
let same = 0
for (const name of wanted) {
  const src = path.join(from, name)
  const dst = path.join(to, name)
  const bytes = fs.readFileSync(src)
  // Only write when the bytes differ, so an unchanged frame keeps its mtime and does not
  // show up as a modification in every diff.
  if (fs.existsSync(dst) && fs.readFileSync(dst).equals(bytes)) {
    same += 1
    continue
  }
  fs.writeFileSync(dst, bytes)
  copied += 1
}

let removed = 0
for (const name of fs.readdirSync(to)) {
  if (!name.toLowerCase().endsWith('.png')) continue
  if (wanted.includes(name)) continue
  fs.rmSync(path.join(to, name))
  console.log(`  removed site/shots/${name} - no longer rendered`)
  removed += 1
}

console.log(
  `site/shots: ${wanted.length} frames (${copied} written, ${same} already current, ${removed} removed)`,
)
