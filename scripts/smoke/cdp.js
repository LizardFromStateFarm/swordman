// Real-app smoke test driver: launches Electron against a throwaway --user-data-dir (never your real save slots),
// connects over the Chrome DevTools Protocol, runs a scenario file, collects console errors + uncaught exceptions,
// saves screenshots, then quits. Node ≥ 22 (global WebSocket/fetch). See docs/systems/qa-sim.md → "Real-app smoke".
// Run: node scripts/smoke/cdp.js scripts/smoke/scenarios/<name>.js   (exit 1 on any FAIL or console error)
// A scenario exports `async ({ ev, click, wait, shot, assert }) => {}`:
//   ev(expr)        — evaluate a JS expression in the page (awaits promises, returns by value)
//   click(selector) — click the first match (throws if none)   · wait(expr, ms) — poll until expr is truthy
//   shot(name, clip?) — PNG into the output folder (printed at the end); clip {x,y,width,height} crops it · assert(cond, msg) — prints ok/FAIL
const { spawn } = require('child_process')
const fs = require('fs'), os = require('os'), path = require('path')

const PORT = 9300 + Math.floor(Math.random() * 500)
const root = path.resolve(__dirname, '../..')
const scenarioPath = path.resolve(process.argv[2] || '')
if (!fs.existsSync(scenarioPath)) { console.error('usage: node scripts/smoke/cdp.js <scenario.js>'); process.exit(2) }
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'cultivator-smoke-'))
const outDir = path.join(root, 'scripts', 'smoke', 'out')
fs.mkdirSync(outDir, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))

;(async () => {
  const electron = require(path.join(root, 'node_modules', 'electron'))
  const app = spawn(electron, ['.', `--user-data-dir=${userData}`, `--remote-debugging-port=${PORT}`], { cwd: root, stdio: 'ignore' })
  let failed = 0
  const errors = []
  try {
    let target = null
    for (let i = 0; i < 100 && !target; i++) {
      await sleep(200)
      try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === 'page') } catch {}
    }
    if (!target) throw new Error('no page target (Electron did not start?)')
    const ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
    let id = 0
    const pending = new Map()
    ws.onmessage = m => {
      const msg = JSON.parse(m.data)
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
      if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text)
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map(a => a.value ?? a.description).join(' '))
    }
    const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
    await send('Runtime.enable')
    const ev = async expr => {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
      if (r.result?.exceptionDetails) throw new Error(`eval failed: ${expr.slice(0, 80)} → ${r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text}`)
      return r.result?.result?.value
    }
    const wait = async (expr, ms = 5000) => {
      for (let t = 0; t < ms; t += 100) { if (await ev(expr)) return true; await sleep(100) }
      throw new Error(`timed out waiting for: ${expr}`)
    }
    const click = async sel => {
      const ok = await ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true })()`)
      if (!ok) throw new Error(`nothing to click: ${sel}`)
      await sleep(150)
    }
    const shots = []
    // clip (optional) = { x, y, width, height } in CSS px — crop to one element, e.g. for a Visual Review Gate close-up
    const shot = async (name, clip) => {
      const r = await send('Page.captureScreenshot', clip ? { format: 'png', clip: { ...clip, scale: 1 } } : { format: 'png' })
      const f = path.join(outDir, `${name}.png`); fs.writeFileSync(f, Buffer.from(r.result.data, 'base64')); shots.push(f)
    }
    const assert = (c, m) => { if (!c) { failed++; console.log('FAIL', m) } else console.log('ok  ', m) }
    await wait('document.readyState === "complete" && typeof gameState !== "undefined"', 15000)
    await require(scenarioPath)({ ev, click, wait, shot, assert, sleep })
    await sleep(300)
    if (shots.length) console.log('screenshots:\n  ' + shots.join('\n  '))
    ws.close()
  } catch (e) {
    failed++; console.log('FAIL', e.message)
  } finally {
    app.kill()
    for (const e of errors) console.log('CONSOLE ERROR', e)
    await sleep(500)
    try { fs.rmSync(userData, { recursive: true, force: true }) } catch {}
    console.log(failed || errors.length ? `✗ ${failed} failed, ${errors.length} console error(s)` : '✓ smoke test passed, zero console errors')
    process.exitCode = failed || errors.length ? 1 : 0
  }
})()
