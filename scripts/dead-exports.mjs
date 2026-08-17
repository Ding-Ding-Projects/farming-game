#!/usr/bin/env node
/**
 * Reports exported symbols that nothing outside their own module ever names.
 *
 * A dead export is not a harmless spare part. It is a drawing nobody calls that still has
 * to keep compiling, still shows up in a search for "where is this drawn", and still gets
 * maintained by the next person who assumes it matters. This finds them so the answer is a
 * fact rather than a guess.
 *
 * Deliberately crude: it looks for the identifier as a whole word anywhere else in the
 * tree, so it errs heavily towards calling something *used*. Anything it reports is
 * genuinely unreferenced, and it will happily miss a symbol that is only mentioned in a
 * comment. That is the right way round for a tool whose output leads to deletion.
 *
 *   npm run check:exports                    # every source directory
 *   node scripts/dead-exports.mjs src/art    # one directory
 *
 * Advisory, and deliberately not a CI gate. A tree-wide run reports a couple of hundred
 * symbols, and most are not faults: `game/` exports its rule constants and its types on
 * purpose, because they are the readable statement of how the economy works and reading
 * them is the point. Turning that into a failing build would only teach people to export
 * less honestly. Point it at a directory, read the list, and decide.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOTS = ['src', 'tests', 'electron', 'site', 'scripts']
const SKIP = /node_modules|[\\/](dist|dist-site|build|release|coverage)[\\/]/

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (SKIP.test(p)) continue
    if (entry.isDirectory()) walk(p, out)
    else if (/\.(ts|mts|mjs|js)$/.test(entry.name)) out.push(p)
  }
  return out
}

/** Every exported name declared in a file, plus `export { a, b }` lists. */
function exportsOf(src) {
  const names = new Set()
  const decl = /^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm
  for (const m of src.matchAll(decl)) names.add(m[1])
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const as = part.split(/\bas\b/)
      const name = (as[as.length - 1] ?? '').trim()
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name)
    }
  }
  return names
}

const target = process.argv[2]
const files = ROOTS.flatMap((r) => walk(r))
const sources = files.map((f) => ({ file: f, text: fs.readFileSync(f, 'utf8') }))

const dead = []
for (const { file, text } of sources) {
  if (target !== undefined && !file.startsWith(path.normalize(target))) continue
  for (const name of exportsOf(text)) {
    const word = new RegExp(`\\b${name.replace(/[$]/g, '\\$')}\\b`, 'g')
    const usedElsewhere = sources.some((o) => o.file !== file && word.test(o.text))
    if (usedElsewhere) continue
    // How often the name appears in its own file. One occurrence is the declaration
    // itself, so anything more means the module uses it internally.
    const own = (text.match(word) ?? []).length
    dead.push({ file, name, internal: own > 1 })
  }
}

if (dead.length === 0) {
  console.log(`No dead exports${target === undefined ? '' : ` under ${target}`}.`)
  process.exit(0)
}

// Two different faults with two different fixes, so they are reported apart. A symbol its
// own module still uses is not dead code — it is merely exported for no reason, and the
// fix is to drop the keyword. A symbol nobody names at all can go.
const overExported = dead.filter((d) => d.internal)
const unused = dead.filter((d) => !d.internal)

if (overExported.length > 0) {
  console.log(`${overExported.length} exported but only used inside their own module:\n`)
  for (const d of overExported) console.log(`  ${d.file}:  ${d.name}`)
  console.log()
}
if (unused.length > 0) {
  console.log(`${unused.length} not named anywhere, including their own module:\n`)
  for (const d of unused) console.log(`  ${d.file}:  ${d.name}`)
}
