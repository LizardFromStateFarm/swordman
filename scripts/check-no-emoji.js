// No-emoji check (CLAUDE.md "No emoji, ever"; roadmap 1.8c inventory → A1 lint). Scans renderer/ and assets/ for
// characters that render as color emoji (Unicode Extended_Pictographic, minus a small allowlist of plain text
// symbols that have no emoji presentation) and prints file:line + the characters.
// Run: node scripts/check-no-emoji.js            → report only (exit 0)
//      node scripts/check-no-emoji.js --strict   → exit 1 if any are found outside the sprite files (in `npm test`
//                                                   since 1.8b-6; sprites are reported but exempt until art track A1)
//      node scripts/check-no-emoji.js --strict --sprites → also fail on sprites (A1 switches `npm test` to this)
const fs = require('fs'), path = require('path')

const ROOTS = ['renderer', 'assets']
const EXT = /\.(js|html|css)$/
// Text-only symbols that are Extended_Pictographic but never drawn as color emoji in Chromium (text presentation).
const ALLOW = new Set(['↩', '▪', '◀', '▶'])
const PICT = /\p{Extended_Pictographic}/gu
// Sprite art is redone by the Phase 34 art track (A1 purges ⚡ ☯); until then it's reported, not failed.
const EXEMPT = process.argv.includes('--sprites') ? [] : ['assets/sprites/']

const hits = []
function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) walk(p)
    else if (EXT.test(f)) {
      fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach((line, i) => {
        const found = (line.match(PICT) || []).filter(c => !ALLOW.has(c))
        if (found.length) hits.push({ file: p.replace(/\\/g, '/'), line: i + 1, chars: found, text: line.trim().slice(0, 90) })
      })
    }
  }
}
ROOTS.forEach(walk)

const byChar = {}
for (const h of hits) for (const c of h.chars) byChar[c] = (byChar[c] || 0) + 1
const quiet = process.argv.includes('--strict')   // strict (npm test) lists only failing lines
for (const h of hits) if (!quiet || !EXEMPT.some(e => h.file.startsWith(e))) console.log(`${h.file}:${h.line}  ${h.chars.join(' ')}   ${h.text}`)
const total = Object.values(byChar).reduce((a, b) => a + b, 0)
console.log(`\n${total} emoji on ${hits.length} lines · ` + Object.entries(byChar).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}×${n}`).join(' '))
const failing = hits.filter(h => !EXEMPT.some(e => h.file.startsWith(e)))
if (failing.length < hits.length) console.log(`(${hits.length - failing.length} lines in ${EXEMPT.join(', ')} exempt until art track A1)`)
if (process.argv.includes('--strict') && failing.length) {
  console.log(`FAIL: ${failing.length} line(s) with emoji outside the exempt sprite files`)
  process.exitCode = 1
}
