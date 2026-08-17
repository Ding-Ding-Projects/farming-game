/**
 * Validates the electron-builder "build" block in package.json against the schema
 * that ships with the installed app-builder-lib.
 *
 * Exists because a bad key is only reported by electron-builder *after* a full
 * typecheck, test and renderer build have run in CI — a slow way to learn that a
 * property is spelled wrong. This checks the same schema in about a second, so the
 * mistake is caught before the push.
 *
 *   npm run check:build
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const schema = require('app-builder-lib/scheme.json')

const defs = schema.definitions ?? {}
const problems = []

/** Returns the property names a definition allows, or null if we cannot tell. */
function allowed(defName) {
  const def = defs[defName]
  if (!def || !def.properties) return null
  return new Set(Object.keys(def.properties))
}

const SECTIONS = [
  { key: 'win', def: 'WindowsConfiguration' },
  { key: 'squirrelWindows', def: 'SquirrelWindowsOptions' },
  { key: 'nsis', def: 'NsisOptions' },
  { key: 'mac', def: 'MacConfiguration' },
  { key: 'linux', def: 'LinuxConfiguration' },
]

const build = pkg.build ?? {}

for (const { key, def } of SECTIONS) {
  const section = build[key]
  if (!section || typeof section !== 'object') continue
  const valid = allowed(def)
  if (!valid) {
    console.warn(`! could not find schema definition ${def}; skipped build.${key}`)
    continue
  }
  for (const prop of Object.keys(section)) {
    if (!valid.has(prop)) {
      problems.push(`build.${key}.${prop} is not a valid ${def} property`)
    }
  }
}

// The root object allows a lot, including every section above, so only check the
// scalar keys we set deliberately.
const rootValid = allowed('Configuration')
if (rootValid) {
  for (const prop of Object.keys(build)) {
    if (!rootValid.has(prop) && !SECTIONS.some((s) => s.key === prop)) {
      problems.push(`build.${prop} is not a valid root Configuration property`)
    }
  }
}

if (problems.length > 0) {
  console.error('electron-builder configuration is invalid:')
  for (const p of problems) console.error(`  - ${p}`)
  console.error('\nValid win properties:')
  console.error('  ' + [...(allowed('WindowsConfiguration') ?? [])].join(', '))
  process.exit(1)
}

console.log('electron-builder configuration is valid.')
for (const { key } of SECTIONS) {
  if (build[key]) console.log(`  build.${key}: ${Object.keys(build[key]).join(', ')}`)
}
