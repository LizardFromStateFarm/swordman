// Icon — inline SVG from the custom UI icon set (roadmap 1.8d; assets/icons/ui-icons.js → UI_ICONS). UI only.
//   Icon('stone')            → '<svg class="ic ic-stone" …>…</svg>' for template strings (1em square, currentColor)
//   Icon('stone', 'lbl-ic')  → same, with an extra class
//   <span data-icon="qi"></span> in static HTML is filled by Icon.hydrate() at boot (and after any innerHTML that
//   carries data-icon attributes). Icons are decorative (aria-hidden): the element around them carries the words or a
//   title. See docs/systems/icons.md.

function Icon(name, cls = '') {
  const body = UI_ICONS[name]
  if (!body) { console.warn(`Icon: unknown icon "${name}"`); return '' }
  return `<svg class="ic ic-${name}${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`
}

Icon.hydrate = (root = document) => {
  for (const el of root.querySelectorAll('[data-icon]')) {
    if (el.dataset.iconDone === el.dataset.icon) continue
    el.innerHTML = Icon(el.dataset.icon)
    el.dataset.iconDone = el.dataset.icon
  }
}

Icon.names = () => Object.keys(UI_ICONS)

// Static markup (index.html) is already parsed when this script runs (scripts sit at the end of <body>).
Icon.hydrate()
