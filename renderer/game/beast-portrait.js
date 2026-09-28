// BeastPortraits: animated ink portraits of spirit beasts (roadmap A4-2) for Roam → Beasts (encounter + companion
// cards). Views re-render their HTML on every state change, so canvases are pooled by key (an encounter or beast id)
// and moved into each fresh placeholder instead of rebuilt (an ink cache build is ~10-20 ms). Placeholders are
// `<div class="beast-portrait" data-bp-key="…" data-bp-type="<spriteState>">`; `mount(root, settings)` fills them.
// With Sprite art = Classic, or for a beast without ink art, it writes the classic ASCII sprite (all frames cycle).
// Uses InkRenderer + INK_BEASTS (assets/sprites/ink-beasts.js) and BEAST_SPRITES. See docs/systems/art-engine.md.

const BeastPortraits = {
  pool: new Map(),        // key → { cv, ink, type }
  W: 108, H: 78,          // CSS px; the portrait's view is 4:3-ish, the renderer fits it

  mount(root, settings = {}) {
    const ink = settings.artStyle === 'ink'
    const used = new Set()
    for (const el of root.querySelectorAll('.beast-portrait[data-bp-key]')) {
      const key = el.dataset.bpKey, type = el.dataset.bpType
      const hasInk = typeof INK_BEASTS !== 'undefined' && InkRenderer.has(type, INK_BEASTS)
      if (!hasInk || (!ink && this.asciiHTML(type))) { el.innerHTML = this.asciiHTML(type); el.classList.add('ascii'); continue }   // Classic, when it has an ASCII sprite
      let P = this.pool.get(key)
      if (!P || P.type !== type) {
        if (P) P.ink.stop()
        const cv = document.createElement('canvas')
        cv.className = 'bp-canvas'
        const r = new InkRenderer(cv, { table: INK_BEASTS, skipHidden: true })
        r.setSize(this.W, this.H)
        r.setStageColor(INK_BEASTS[type].glow || '#7A6AB0')
        r.t = Math.random() * 20                                 // beasts don't breathe in step
        P = { cv, ink: r, type }
        this.pool.set(key, P)
      }
      P.ink.setReducedMotion(!!settings.reducedMotion)
      P.ink.setSpeed(settings.animSpeed || 1)
      el.appendChild(P.cv)
      P.ink.setState(type)                                       // starts the loop if it was stopped
      used.add(key)
    }
    for (const [key, P] of this.pool) if (!used.has(key)) { P.ink.stop(); this.pool.delete(key) }
  },

  // A placeholder for a view's HTML string.
  html(key, type) { return `<div class="beast-portrait" data-bp-key="${String(key).replace(/"/g, '')}" data-bp-type="${type}"></div>` },

  // The classic grid sprite (every frame, cycled by CSS), used when Sprite art = Classic.
  asciiHTML(type) {
    const sp = typeof BEAST_SPRITES !== 'undefined' && BEAST_SPRITES[type]
    if (!sp?.frames?.length) return ''
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const frames = sp.frames.map((frame, i) => `<div class="bp-frame" style="--i:${i};--n:${sp.frames.length}">${frame.map(row =>
      `<div>${[...row].map(ch => `<span style="color:${sp.colors?.[ch] || sp.defaultColor || '#9070C8'}">${esc(ch)}</span>`).join('')}</div>`).join('')}</div>`).join('')
    return `<div class="bp-ascii">${frames}</div>`
  },
}
