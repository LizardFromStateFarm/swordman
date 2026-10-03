// Chrome-CJK check (roadmap 1.8d-2; CLAUDE.md → "UI icons come from the custom SVG icon set"). CJK in the UI is
// reserved for the six nav group marks and deliberate in-world flavour. This scans renderer/ (.js/.html/.css) for
// CJK characters in code (comments are skipped) and prints file:line + the characters. Allowed:
//   - renderer/game/nav.js NAV_GROUPS glyph lines (修 歷 家 宗 囊 世) and the 道 rail ornament
//   - any line ending in a `cjk-ok` comment (in-world flavour, e.g. a technique's Chinese name shown as content)
// Flavour that lives in assets/data (stage names, sect nameCN, …) is content, not chrome, and is not scanned.
// Run: node scripts/check-no-chrome-cjk.js            → report (exit 0)
//      node scripts/check-no-chrome-cjk.js --strict   → exit 1 on any hit (part of `npm test` since 1.8d-2)
// Doc: docs/systems/icons.md → "Lint".
const fs = require('fs'), path = require('path')

const root = path.join(__dirname, '..')
const CJK = /[㐀-䶿一-鿿豈-﫿]/g
const NAV_MARKS = /glyph: '[修歷家宗囊世]'|id="rail-ink">道</

// Remove comments so documentation text never trips the check. Line-preserving: block comments keep their newlines.
function stripComments(src, ext) {
  const blank = m => m.replace(/[^\n]/g, ' ')
  if (ext === '.html') return src.replace(/<!--[\s\S]*?-->/g, blank)
  if (ext === '.css') return src.replace(/\/\*[\s\S]*?\*\//g, blank)
  // JS: strip /* */ and // comments outside strings/templates (small state machine; good enough for this codebase)
  let out = '', i = 0, q = null
  while (i < src.length) {
    const c = src[i], n = src[i + 1]
    if (q) { out += c; if (c === '\\') { out += n ?? ''; i += 2; continue } if (c === q) q = null; i++; continue }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? src.length : e + 2; out += blank(src.slice(i, end)); i = end; continue }
    if (c === '/' && n === '/') {
      const e = src.indexOf('\n', i); const end = e < 0 ? src.length : e
      const comment = src.slice(i, end)
      out += /cjk-ok/.test(comment) ? ' /*cjk-ok*/' + ' '.repeat(Math.max(0, comment.length - 11)) : blank(comment)
      i = end; continue
    }
    out += c; i++
  }
  return out
}

const hits = []
function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) { walk(p); continue }
    const ext = path.extname(f)
    if (!['.js', '.html', '.css'].includes(ext)) continue
    const raw = fs.readFileSync(p, 'utf8'), rawLines = raw.split(/\r?\n/)
    stripComments(raw, ext).split(/\r?\n/).forEach((line, i) => {
      if (/cjk-ok/.test(rawLines[i]) || NAV_MARKS.test(line)) return
      const found = line.match(CJK)
      if (found) hits.push({ file: path.relative(root, p).replace(/\\/g, '/'), line: i + 1, chars: [...new Set(found)], text: line.trim().slice(0, 100) })
    })
  }
}
walk(path.join(root, 'renderer'))

for (const h of hits) console.log(`${h.file}:${h.line}  ${h.chars.join('')}   ${h.text}`)
const files = new Set(hits.map(h => h.file))
console.log(`\n${hits.length} line(s) with chrome CJK in ${files.size} file(s)` + (hits.length ? '' : ' — clean'))
if (process.argv.includes('--strict') && hits.length) process.exitCode = 1
