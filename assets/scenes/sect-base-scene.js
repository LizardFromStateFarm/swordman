// SECT_SCENE — the Sect Base scene data (roadmap A7 / Phase 38A): the compound's palette, its black starry-night
// sky, the terrace's ground line and the fixed spot each structure stands on. Data only, no logic.
// Used by renderer/engine/scene-renderer.js (SceneRenderer.buildSectScene reads it) via renderer/game/base-view.js.
// See docs/systems/scene-art.md.
//
// The sect stands on a mountain peak: there is NO landscape behind it — only the black, starry night (``ridges: false``).
// Coordinates: a 420×236 logical scene (ratio ≈ 1.78, close to the canvas the view fits, so little of the pane goes
// unused). The compound is centred; the terrain (drawn by scene-renderer.js) spans the whole visible width, so a wide
// Desktop canvas is still filled. `y` on a slot is the structure's BASE centre. Colours are palette keys.

const SECT_SCENE = {
  box: [0, 0, 420, 236],      // logical scene units [x0, y0, x1, y1]
  ground: 132,                // the terrace plateau's back edge
  front: 196,                 // the front lip of the terrace (the rock face falls away below it)
  pathX: 206,                 // the paved path curves up the terrace toward here
  dot: { pitch: 1.7 },       // fine dots: the renderer draws at ≥2× (see SceneRenderer._dpr), so these stay crisp
  light: { x: 190, spread: 100 },

  // A black, starry night: a near-black sky so the compound's lit roofs and windows carry the frame. No hills — the
  // summit sits against the sky, so nothing competes with the buildings.
  palette: {
    sky0: '#04060E', sky1: '#0C1120', moon: '#F4DCA8',
    mountFar: '#232F49', mountNear: '#0F1523', bleed: '#0E1119', mist: '#B8B4C8', ridgeRim: '#F4D27E',
    slope: '#242C3E', stone: '#7C7686', stoneDeep: '#3A3143', stoneHi: '#CEC4CC', path: '#9A8868',
    shadow: '#1A1620',
    wall: '#B08A5C', wallHi: '#E8CC96', roof: '#46536E', roofHi: '#AEC2DA', roofDeep: '#212B3C',
    wood: '#7A5038', woodHi: '#C49458', lamp: '#FFD27A', gold: '#F2D45C', jade: '#3ECF8E',
    ward: '#7AE6F4', wardDim: '#4A6572', banner: '#D24A3A', bannerGold: '#E8C878',
    pine: '#2A3E52', water: '#6E92AA', beast: '#5A5468',
  },

  background: {
    glow: { x: 206, y: 168, r: 240 },
    moon: { x: 330, y: 46, r: 13, a: 1.7 },           // a clear moon high in the black sky
    ridges: false,                                    // the sect sits on a peak: no hills, only the starry sky behind it
    mistA: 0,
    // Only the night sky: stars, and their big sparkling cousins. `fade` thins the small stars toward their floor;
    // `buildSectScene` masks a column out of both around the Sect Hall's spire so no star lands on a roof.
    ambience: [
      { kind: 'stars', n: 190, color: 'moon', y1: 90, fade: 24 },
      { kind: 'bigStars', n: 10, color: 'moon', size: 2.4, y1: 76 },
      { kind: 'fireflies', n: 8, color: 'lamp', box: [20, 380, 144, 206] },
    ],
  },

  // One entry per structure. `id` gates it (a founded sect's `buildings[id]`, or the always-present hall/gate/ward);
  // `kind` names its painter in scene-renderer.js. Back → front, so draw order reads as depth. The compound fills the
  // middle band: the great hall on its terrace, the halls around it, the gate and the ward on the central axis.
  slots: [
    { id: 'qi_library',      kind: 'pagoda',   x: 306, y: 150, scale: 1.25 },
    { id: 'hall',            kind: 'hall',     x: 174, y: 148, scale: 1.45 },   // scale grows with the Sect Hall level
    { id: 'pill_hall',       kind: 'pillHall', x: 76,  y: 154, scale: 1.25 },
    { id: 'beast_pen',       kind: 'pen',      x: 44,  y: 172, scale: 1.2 },
    { id: 'treasury',        kind: 'vault',    x: 266, y: 166, scale: 1.25 },
    { id: 'training_ground', kind: 'yard',     x: 364, y: 170, scale: 1.25 },
    { id: 'defensive_array', kind: 'ward',     x: 208, y: 176, scale: 1.5 },
    { id: 'gate',            kind: 'gate',     x: 208, y: 196, scale: 1.35 },
  ],

  dressing: {
    lanterns: [[148, 184], [266, 184], [178, 192], [240, 192]],
  },
}
