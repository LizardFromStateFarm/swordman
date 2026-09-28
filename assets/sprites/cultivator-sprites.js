// ASCII art sprite definitions for the cultivator character.
// Each sprite has: frames (array of string-arrays), fps, colors (char → css color), defaultColor.
//
// ASSET PIPELINE: All sprites in this file were created and reviewed per .agents/rules/assets.md
// Minimum review score: 8/10 before inclusion.
//
// NOTE: cultivation seal symbol is ⊕ (circled-plus energy matrix). Do NOT use 卍 or 卐.

const CULTIVATOR_SPRITES = {

  // ── IDLE (pre-cultivation mortal) ───────────────────────────────────────
  idle: {
    fps: 0.4,
    defaultColor: '#C8B89A',
    colors: {
      'o': '#E8D5B7', '(': '#C8B89A', ')': '#C8B89A',
      '_': '#8A7560', '|': '#8A7560', '/': '#8A7560', '\\': '#8A7560',
    },
    frames: [
      [
        "           ",
        "   (o_o)   ",
        "   |   |   ",
        "  /|   |\\  ",
        "   |   |   ",
        "  / \\ / \\  ",
        "           ",
      ],
      [
        "           ",
        "   (-_-)   ",
        "   |   |   ",
        "  /|   |\\  ",
        "   |   |   ",
        "  / \\ / \\  ",
        "           ",
      ],
    ],
  },

  // ── MEDITATING (Qi Condensation, Foundation Building) ───────────────────
  meditating: {
    fps: 0.5,
    defaultColor: '#C8B89A',
    colors: {
      '☯': '#FFD700', '~': '#4A90D9', '·': '#4A90D9',
      '∿': '#4A90D9', '≋': '#87CEEB', '◉': '#87CEEB',
      '‿': '#FFD700', '⊕': '#FF6B6B', '◆': '#9B59B6',
      '╭': '#8A7560', '╮': '#8A7560', '╰': '#8A7560', '╯': '#8A7560',
      '─': '#8A7560', '│': '#8A7560', '║': '#4A90D9', '╥': '#4A90D9',
      '╲': '#8A7560', '╱': '#8A7560',
    },
    frames: [
      [
        "   ~·☯·~   ",
        "  ∿(◉‿◉)∿  ",
        "  ≋  ⊕  ≋  ",
        "  ╭─────╮  ",
        "  │  ║  │  ",
        "  ╰──╥──╯  ",
        " ╱╲  ║  ╱╲ ",
        "╱  ╲─◆─╱  ╲",
      ],
      [
        "  ~~·☯·~~  ",
        " ·(◉‿◉)·   ",
        " ≋  ⊕  ≋   ",
        "  ╭─────╮  ",
        "  │  ║  │  ",
        "  ╰──╥──╯  ",
        " ╱╲  ║  ╱╲ ",
        "╱  ╲─◆─╱  ╲",
      ],
    ],
  },

  // ── DEEP MEDITATION (Foundation Building late, Core Formation) ──────────
  meditating_deep: {
    fps: 0.6,
    defaultColor: '#C8B89A',
    colors: {
      '☯': '#FFD700', '✦': '#4A90D9', '✧': '#87CEEB',
      '◉': '#87CEEB', '◡': '#FFD700', '⊕': '#FF6B6B',
      '◆': '#9B59B6', '║': '#4A90D9', '╥': '#4A90D9',
      '∞': '#9B59B6', '≈': '#4A90D9', '○': '#87CEEB',
      '╭': '#8A7560', '╮': '#8A7560', '╰': '#8A7560', '╯': '#8A7560',
      '─': '#8A7560', '│': '#8A7560', '╲': '#8A7560', '╱': '#8A7560',
    },
    frames: [
      [
        " ✦·✧·☯·✧·✦ ",
        "  ○(◉◡◉)○  ",
        " ≈≈  ⊕  ≈≈ ",
        "  ╭─────╮  ",
        "  │ ∞║∞ │  ",
        "  ╰──╥──╯  ",
        "✧╱╲  ║  ╱╲✧",
        "╱  ╲─◆─╱  ╲",
      ],
      [
        " ✧·✦·☯·✦·✧ ",
        " ○ (◉◡◉) ○ ",
        "≈≈   ⊕   ≈≈",
        "  ╭─────╮  ",
        "  │ ∞║∞ │  ",
        "  ╰──╥──╯  ",
        "✦╱╲  ║  ╱╲✦",
        "╱  ╲─◆─╱  ╲",
      ],
      [
        "✦✧·✦·☯·✦·✧✦",
        "○  (◉◡◉)  ○",
        "≈   ∞⊕∞   ≈",
        "  ╭─────╮  ",
        "  │ ∞║∞ │  ",
        "  ╰──╥──╯  ",
        "╱╲✦  ║  ✦╱╲",
        "  ╲──◆──╱  ",
      ],
    ],
  },

  // ── LEVITATING (Core Formation, Nascent Soul) ───────────────────────────
  levitating: {
    fps: 0.7,
    defaultColor: '#C8B89A',
    colors: {
      '☯': '#FFD700', '★': '#FFD700', '✦': '#9B59B6',
      '◉': '#87CEEB', '◡': '#FFD700', '⊕': '#FF6B6B',
      '◆': '#9B59B6', '║': '#9B59B6', '≋': '#9B59B6',
      '·': '#9B59B6', '~': '#9B59B6', '∾': '#9B59B6',
      '╭': '#8A7560', '╮': '#8A7560', '╰': '#8A7560', '╯': '#8A7560',
      '─': '#8A7560', '│': '#8A7560', '╲': '#8A7560', '╱': '#8A7560',
    },
    frames: [
      [
        "✦★·☯·★✦    ",
        "  (◉◡◉)    ",
        "≋≋  ⊕  ≋≋  ",
        "  ╭─────╮  ",
        "  │ ◆║◆ │  ",
        "  ╰──╨──╯  ",
        "   ∾ ║ ∾   ",
        "     ◆     ",
      ],
      [
        " ✦★·☯·★✦   ",
        "  (◉◡◉)    ",
        " ≋  ⊕  ≋   ",
        "  ╭─────╮  ",
        "  │ ◆║◆ │  ",
        "  ╰──╨──╯  ",
        "  ∾  ║  ∾  ",
        "     ◆     ",
      ],
    ],
  },

  // ── TRANSCENDING (Nascent Soul+, Spirit Severing) ───────────────────────
  transcending: {
    fps: 0.8,
    defaultColor: '#F0E68C',
    colors: {
      '☯': '#FFFFFF', '✦': '#FFD700', '✧': '#FFD700',
      '★': '#FF6B6B', '⚡': '#FFFFFF', '◉': '#FFD700',
      '◡': '#FFFFFF', '⊕': '#FF8040', '◆': '#FFD700',
      '║': '#FFD700', '∾': '#FFD700', '≋': '#FFD700',
      '~': '#FFD700', '·': '#FFD700', '○': '#FFFFFF',
      '╭': '#C8A860', '╮': '#C8A860', '╰': '#C8A860', '╯': '#C8A860',
      '─': '#C8A860', '│': '#C8A860', '╲': '#C8A860', '╱': '#C8A860',
    },
    frames: [
      [
        "✦✧·★·☯·★·✧✦",
        "⚡ (◉◡◉) ⚡  ",
        "✦≋  ⊕  ≋✦  ",
        "  ╭─────╮  ",
        "  │✦ ║ ✦│  ",
        "  ╰──╨──╯  ",
        "✧  ∾║∾  ✧  ",
        "    ─◆─    ",
      ],
      [
        "✧✦·★·☯·★·✦✧",
        "⚡ (◉◡◉) ⚡  ",
        "✧≋  ⊕  ≋✧  ",
        "  ╭─────╮  ",
        "  │✧ ║ ✧│  ",
        "  ╰──╨──╯  ",
        "✦  ∾║∾  ✦  ",
        "    ─◆─    ",
      ],
      [
        "·✦·☯·✦·☯·✦·",
        "○ (◉◡◉) ○  ",
        "~≋  ⊕  ≋~  ",
        " ╭──────╮  ",
        " │ ✦║✦  │  ",
        " ╰───╨──╯  ",
        " ✧  ∾║∾ ✧  ",
        "     ◆─    ",
      ],
    ],
  },

  // ── BREAKTHROUGH (animation played during breakthrough attempt) ─────────
  breakthrough: {
    fps: 4,
    defaultColor: '#FFFFFF',
    colors: {
      '☯': '#FFD700', '⚡': '#FFFFFF', '★': '#FFD700',
      '◉': '#FFFFFF', '⊕': '#FF4040', '◆': '#FFD700',
      '!': '#FF4040', '·': '#FFD700',
    },
    frames: [
      [
        "    ·☯·    ",
        "  ⚡(◉◉)⚡  ",
        "  ★  ⊕  ★  ",
        "  ╭─────╮  ",
        "  │ ⚡║⚡ │  ",
        "  ╰──╥──╯  ",
        " ⚡╱╲ ║ ╱╲⚡",
        "╱   ╲◆╱   ╲",
      ],
      [
        "  ★·⚡·★    ",
        " ·(◉◉)·    ",
        " ⚡  ⊕  ⚡  ",
        " ╭───────╮ ",
        " │⚡·║·⚡│  ",
        " ╰────╥──╯ ",
        "⚡╱╲   ║  ⚡",
        "╱   ╲─◆─  ╲",
      ],
      [
        "⚡★·⚡·☯·⚡·★⚡",
        " (◉◉)       ",
        "★★  ⊕  ★★  ",
        " ╭──────╮  ",
        " │!⚡║⚡!│  ",
        " ╰───╥──╯  ",
        "⚡╱╲  ║  ╱⚡",
        "╱  ╲─◆─╱  ╲",
      ],
      [
        "           ",
        "  ≋≋≋≋≋≋≋  ",
        "≋(◉◡◉)≋≋   ",
        "≋  ☯⊕☯  ≋  ",
        "≋ ╭────╮ ≋  ",
        "≋ │ ★║★│ ≋  ",
        "≋ ╰──╥─╯ ≋  ",
        "≋  ╱╲║╱╲  ≋ ",
      ],
    ],
  },

}

// Spirit Severing + Ascension have their own ink art (A4-1: `severing`, `ascended`); the classic grid sprite reuses
// the Transcending frames for both.
CULTIVATOR_SPRITES.severing = CULTIVATOR_SPRITES.transcending
CULTIVATOR_SPRITES.ascended = CULTIVATOR_SPRITES.transcending
