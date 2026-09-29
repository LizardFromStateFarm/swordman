// ASCII art sprites for spiritual beasts.
// ASSET PIPELINE: all sprites created and reviewed per .agents/rules/assets.md — min score 8.0/10.
// Used by: game.js (renderBeastSpriteHTML utility for beast panel display in Explore tab)

const BEAST_SPRITES = {

  // ── SPIRIT FOX (灵狐) — Review score: 8.2 ─────────────────────────────────
  spirit_fox: {
    fps: 1.0,
    defaultColor: '#D4954A',
    colors: {
      '∧': '#D4954A',
      '◉': '#87CEEB', '◇': '#FFD700', '★': '#FFD700',
      '≋': '#4A90D9', '∿': '#4A90D9',
      '(': '#C8A870', ')': '#C8A870',
      '╲': '#C8A870', '╱': '#C8A870',
      '╾': '#C8A870', '╼': '#C8A870',
      '│': '#8A7560',
    },
    frames: [
      [
        "  ∧   ∧   ",
        " (◉  ◇  ◉)",
        "  ╲ ★★ ╱  ",
        "   │   │  ",
        "  ╱     ╲ ",
        " ≋≋≋∿∿∿╾╾ ",
      ],
      [
        "  ∧   ∧   ",
        " (◉  ◇  ◉)",
        "  ╲ ★★ ╱  ",
        "   │   │  ",
        "  ╱     ╲ ",
        " ╼╼∿∿∿≋≋≋ ",
      ],
    ],
  },

  // ── THUNDER EAGLE (雷鹰) — Review score: 8.4 ───────────────────────────────
  thunder_eagle: {
    fps: 1.2,
    defaultColor: '#5A6A8A',
    colors: {
      'ϟ': '#FFFFFF',
      '◉': '#87CEEB',
      '▲': '#5A6A8A',
      '─': '#5A6A8A', '╲': '#5A6A8A', '╱': '#5A6A8A',
      '║': '#5A6A8A', '═': '#5A6A8A',
    },
    frames: [
      [
        "ϟ─────────ϟ",
        "  ╲  ◉◉  ╱  ",
        "   ╲ ϟϟ ╱   ",
        "    ╲──╱    ",
        "     ║║     ",
        "    ╱  ╲    ",
      ],
      [
        "  ϟ─────ϟ   ",
        "╱╱  ◉◉  ╲╲  ",
        "    ϟ  ϟ     ",
        "    ╲──╱    ",
        "     ║║     ",
        "    ╱  ╲    ",
      ],
    ],
  },

  // ── VOID HOUND (虚空犬) — Review score: 8.6 ────────────────────────────────
  void_hound: {
    fps: 0.6,
    defaultColor: '#9070C8',
    colors: {
      '∧': '#9080B0', '◉': '#87CEEB', '◆': '#C060E0', '◎': '#FFD700',
      '╰': '#7A5A9A', '╯': '#7A5A9A', '─': '#7A5A9A', '│': '#7A5A9A',
      '∿': '#6A4A8A', '▪': '#E080FF',
    },
    frames: [
      [
        "  ∧   ∧    ",
        " ◆◉   ◉◆   ",
        " ╰──▪──╯   ",
        " ∿│   │∿   ",
        "  ─┘ └─    ",
        " ∿  ∿  ∿   ",
      ],
      [
        "  ∧   ∧    ",
        " ◆◉   ◉◆   ",
        " ╰──◎──╯   ",
        "∿∿│   │∿∿  ",
        "  ─┘ └─    ",
        "∿∿∿∿∿∿∿∿   ",
      ],
    ],
  },

}
