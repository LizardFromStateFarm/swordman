// WorldView — 世 World → Sects (Phase 43h follow-up, user 2026-10-02: "make the log tab a world tab and have the sects of
// the world there"). The ranked list of every living sect (SectView._ledger(s, true)); tap one and its own page
// (SectDetail.html) draws inline here, with an "All sects" back link. The 世 World group also holds the old Log views
// (Events · Banter). Pane: #tab-world. docs/systems/npc-sects.md → "43h".

const WorldView = {
  open: null,            // the sect whose page is showing (null = the list)
  deps: null,            // { gameState, ledger(s) }

  init(deps) {
    this.deps = deps
    document.getElementById('tab-world').addEventListener('click', e => this._click(e))
    return this
  },
  // Show sect `id`'s page (other views link here)
  show(id) { this.open = id; SectDetail.tradePick = null },

  render(s) {
    const el = document.getElementById('tab-world')
    let html = this.open ? SectDetail.html(s, this.open) : null
    if (this.open && !html) this.open = null                       // the sect fell, or was taken
    if (!html) html = `<div class="world-view">${this.deps.ledger(s) || '<div class="fk-note">No sects are known to you yet.</div>'}</div>`
    else html = `<div class="world-view">${html}</div>`
    el.innerHTML = html
    el.querySelectorAll('[data-w]').forEach(b => { b.style.width = b.dataset.w + '%' })
  },

  _rerender(top = false) {
    this.render(this.deps.gameState.get())
    if (top) document.getElementById('tab-world').scrollTop = 0
  },

  _click(e) {
    if (e.target.closest('[data-back]')) { this.open = null; return this._rerender(true) }
    const row = e.target.closest('[data-sa="wsopen"]')
    if (row) { this.show(row.dataset.id); return this._rerender(true) }
    const sa = e.target.closest('[data-sa]')?.dataset.sa
    if (sa === 'wsmore' || sa === 'wschron' || sa === 'wsashes') return                  // <details> toggle on their own
    if (this.open) SectDetail.click(e, this.open, () => this._rerender())
  },
}
