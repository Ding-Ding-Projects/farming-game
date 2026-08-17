/**
 * Prints the repository's line-count table.
 *
 * Committed as a script on purpose: the release workflow runs this over the exact
 * commit being released and writes the output straight into the release notes, so
 * the figure is produced by the same run that built the artifacts and cannot drift
 * from a hand-typed number. Anyone can reproduce it locally with `npm run count`.
 *
 *   node scripts/count-lines.mjs            # markdown table
 *   node scripts/count-lines.mjs --json     # machine-readable
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-electron',
  'dist-site',
  'release',
  'coverage',
  '.vite',
])

/** Ordered: the first matching rule wins, so `tests/` beats the `.ts` rule. */
const GROUPS = [
  { name: 'Game rules', match: (p) => p.startsWith(`src${sep}game${sep}`) },
  { name: 'Engine', match: (p) => p.startsWith(`src${sep}engine${sep}`) },
  { name: 'Art', match: (p) => p.startsWith(`src${sep}art${sep}`) },
  { name: 'Renderer', match: (p) => p.startsWith(`src${sep}renderer${sep}`) },
  { name: 'Application shell', match: (p) => p.startsWith(`src${sep}shell${sep}`) },
  { name: 'Electron', match: (p) => p.startsWith(`electron${sep}`) },
  { name: 'Website', match: (p) => p.startsWith(`site${sep}`) },
  { name: 'Tests', match: (p) => p.startsWith(`tests${sep}`) },
  { name: 'Scripts', match: (p) => p.startsWith(`scripts${sep}`) },
  { name: 'Documentation', match: (p) => p.endsWith('.md') },
]

const COUNTED = new Set(['.ts', '.js', '.mjs', '.css', '.html', '.md', '.yml', '.json'])

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const rows = new Map()
let totalFiles = 0
let totalLines = 0

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file)
  const dot = rel.lastIndexOf('.')
  if (dot < 0 || !COUNTED.has(rel.slice(dot))) continue

  const group = GROUPS.find((g) => g.match(rel))
  if (!group) continue

  const lines = readFileSync(file, 'utf8').split('\n').length
  const row = rows.get(group.name) ?? { files: 0, lines: 0 }
  row.files += 1
  row.lines += lines
  rows.set(group.name, row)
  totalFiles += 1
  totalLines += lines
}

const ordered = GROUPS.filter((g) => rows.has(g.name)).map((g) => ({
  group: g.name,
  ...rows.get(g.name),
}))

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ groups: ordered, totalFiles, totalLines }, null, 2))
} else {
  console.log('| Area | Files | Lines |')
  console.log('|---|---:|---:|')
  for (const r of ordered) {
    console.log(`| ${r.group} | ${r.files} | ${r.lines.toLocaleString('en-US')} |`)
  }
  console.log(`| **Total** | **${totalFiles}** | **${totalLines.toLocaleString('en-US')}** |`)
}
