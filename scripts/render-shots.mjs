#!/usr/bin/env node
/**
 * Renders every screenshot, then publishes them to the website's own folder.
 *
 * `SHOTS=1 npx vitest run ...` is fine to type on a POSIX shell and does not work on
 * Windows `cmd`, which is the platform this project actually ships on. So the one
 * supported way to produce the images is `npm run shots`, and it is this — the env var
 * is set here, where it is portable, rather than in a shell fragment that is not.
 *
 * Two steps, and the second only runs if the first passed: a failed render must never
 * publish half a set of frames to the download page.
 */
import { spawnSync } from 'node:child_process'
import * as path from 'node:path'

// Node refuses to spawn a .cmd shim directly since 18.20, so on Windows this has to go
// through the shell. Every argument here is a literal in this file — nothing reaches the
// shell that did not come from this repository.
const render = spawnSync('npx', ['vitest', 'run', 'tests/shots.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, SHOTS: '1' },
  cwd: process.cwd(),
  shell: process.platform === 'win32',
})

if (render.error) {
  console.error(`Could not run vitest: ${render.error.message}`)
  process.exit(1)
}
if (render.status !== 0) {
  console.error('\nThe screenshot renderer failed. Nothing has been published to site/shots.')
  process.exit(render.status ?? 1)
}

const sync = spawnSync(process.execPath, [path.join('scripts', 'sync-shots.mjs')], {
  stdio: 'inherit',
  cwd: process.cwd(),
})
process.exit(sync.status ?? 1)
