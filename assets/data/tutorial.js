// TUTORIAL_LESSONS + TUTORIAL_GROUPS — the coach-mark lessons (task 1.23): what each one points at and says, and when it
// first plays. Data only. Read by renderer/game/tutorial.js (TutorialUI: spotlight + the Guide in Settings) and
// game-state.js (seen-state lives in the cross-save soul record). See docs/systems/tutorial.md.
//
// A lesson: { id, group, title, trigger, opens?, steps:[{ at, title?, text }] }
//   trigger  { start: true }   — the first time a game is on screen (the HUD tour)
//            { view: 'arts' }  — the first time that sub-view is opened; replay opens it first
//            { el: '<css>' }   — the first time that element is on screen (an unlock you can see)
//   needs    — the Guide's lock reason while the view isn't offered to you (the sect views)
//   inBattle — may play over the battle page (every other lesson waits while any popup is open)
//   opens    — the Guide's short line for a lesson whose trigger hasn't happened yet ("When your Qi first fills")
//   steps.at — CSS selectors tried in order; the first one visible gets the spotlight. None visible → the card
//              sits in the middle with no cutout (it still reads). Keep each text to one or two short sentences.

const TUTORIAL_GROUPS = [
  { id: 'basics',    name: 'Basics' },
  { id: 'cultivate', name: 'Path' },
  { id: 'adventure', name: 'Roam' },
  { id: 'kin',       name: 'Kin' },
  { id: 'sect',      name: 'Sect' },
  { id: 'pack',      name: 'Pack' },
  { id: 'log',       name: 'World' },
]

const TUTORIAL_LESSONS = [
  // ── Basics ──────────────────────────────────────────────────────────────
  // The intro (2026-10-05, the user's own text): `intro: true` plays as the full-window ink scroll (renderer/game/intro.js),
  // not a coach mark — before the HUD tour on a new game, replayable from the Guide. Its steps have no `at`.
  { id: 'intro', group: 'basics', title: 'The story so far', trigger: { start: true }, intro: true,
    steps: [
      { title: 'The Nine Provinces',
        text: 'Mortals are born, spend most of their lives working, and die like hot garbage in about eighty years. Most consider this a life well lived.' },
      { title: 'An awakening',
        text: 'One morning, your spiritual root stirs, and suddenly you can feel the Qi in the world. Naturally, you conclude this means you are destined for greatness. You are probably wrong. But for now, confidence is free.' },
      { title: 'The path',
        text: 'Sit. Breathe. Gather Qi until your dantian can hold no more, then break through to the next realm. Fail, and half of it scatters. Succeed, and become slightly insufferable.' },
      { title: 'No one climbs alone',
        text: 'Join a sect, or found your own. Marry, raise heirs, build a clan that remembers you, because you will die. Probably more than once.' },
      { title: 'The peak',
        text: 'At the summit waits Immortality. Each life carries your bloodline a little higher, until one of you walks through the heavenly gate. Everything else is face-slapping along the way.' },
    ] },
  { id: 'hud', group: 'basics', title: 'Your first steps', trigger: { start: true },
    steps: [
      { at: ['#sprite-wrap'], title: 'Your cultivator',
        text: 'This is you. You gather Qi on your own, even while the window sits at the edge of your screen.' },
      { at: ['#qi-block'], title: 'Qi',
        text: 'The bar fills with Qi. When it is full you can break through to the next stage.' },
      { at: ['#qi-rate', '#qi-block'], title: 'Every underlined number explains itself',
        text: 'Tap Qi/s, the cap, Health or any underlined number to see what it is made of.' },
      { at: ['#med-split', '#btn-meditate'], title: 'Meditate',
        text: 'Meditate for a short burst of faster Qi. Use it whenever it is ready.' },
      { at: ['#bt-split', '#btn-breakthrough'], title: 'Breakthrough',
        text: 'Lights up when your Qi is full. The ? shows your odds and what a failure costs.' },
      { at: ['#vitals'], title: 'Integrity and Health',
        text: 'Integrity is your foundation: failed breakthroughs crack it. Health is your body: at zero, this life ends.' },
      { at: ['#stones-block', '#vitals'], title: 'Spirit Stones',
        text: 'Stones are the coin of the world. They buy techniques, formulas, gifts and halls.' },
      { at: ['#attention'], title: 'What needs you',
        text: 'Anything waiting on a decision shows up here. Tap a row to jump straight to it.' },
      { at: ['#tabs'], title: 'Six places to go',
        text: 'Path, Roam, Kin, Sect, Pack and World. Each place has its own tabs, and each gets a short tip the first time you open it.' },
      { at: ['#btn-settings'], title: 'The Guide',
        text: 'Replay any tip, or turn tips off, from Settings → Guide.' },
    ] },
  { id: 'breakthrough', group: 'basics', title: 'Breaking through', trigger: { el: '#btn-breakthrough:not(:disabled)' },
    opens: 'When your Qi first fills',
    steps: [
      { at: ['#bt-split', '#btn-breakthrough'], title: 'Your Qi is full',
        text: 'Break through to reach the next stage: more Qi per second and a bigger cap.' },
      { at: ['#bt-why', '#bt-split'], title: 'Check the odds first',
        text: 'A failure costs Qi, Integrity and Karma. If the odds are low, raise them first with techniques, pills or rest.' },
    ] },
  { id: 'attention', group: 'basics', title: 'The attention strip', trigger: { el: '#attention .att-item' },
    opens: 'When something needs you',
    steps: [
      { at: ['#attention .att-item', '#attention'], title: 'Something needs you',
        text: 'Choices, finished timers and visitors wait here. Nothing is lost while it waits. Tap a row to go there.' },
    ] },
  { id: 'flow', group: 'basics', title: 'Meridian Flow', trigger: { el: '#btn-flow:not(.hidden)' },
    opens: 'Once body training starts',
    steps: [
      { at: ['#btn-flow'], title: 'A puzzle for Qi',
        text: 'Meridian Flow is an optional puzzle. Solve it for a chunk of Qi. Its charges refill over time.' },
    ] },
  { id: 'mode', group: 'basics', title: 'Idle and Active modes', trigger: { el: '#auto-chip:not(.hidden)' },
    opens: 'When automation unlocks',
    steps: [
      { at: ['#auto-chip', '#btn-mode'], title: 'Automation',
        text: 'Some chores can now run on their own. Choose which ones in the Mode panel, and switch between Idle and Active play.' },
    ] },

  // ── Path ────────────────────────────────────────────────────────────────
  { id: 'v_stats', group: 'cultivate', title: 'Character', trigger: { view: 'stats' },
    steps: [
      { at: ['#tab-stats'], title: 'Character',
        text: 'Your root, stage, age, bloodline and name. Every tile explains itself when you tap its number.' },
      { at: ['#tab-stats .ch-tag.root', '#tab-stats'], title: 'Your Spiritual Root',
        text: 'The root you were born with multiplies all your Qi: Mixed ×1, Dual ×1.4, Pure ×1.8, Heavenly ×3. Its elements shape which arts suit you.' },
      { at: ['#tab-stats .ch-tag.root', '#tab-stats'], title: 'A better root',
        text: 'A poor root is not your fate. Brew a root elixir in Pack → Craft → Elixirs: drinking one re-forges your root at the odds it lists.' },
    ] },
  { id: 'v_techniques', group: 'cultivate', title: 'Techniques', trigger: { view: 'techniques' },
    steps: [
      { at: ['#tab-techniques'], title: 'Techniques',
        text: 'Spend Spirit Stones to learn cultivation methods. They raise Qi/s and your breakthrough odds for good.' },
    ] },
  { id: 'v_arts', group: 'cultivate', title: 'Combat arts', trigger: { view: 'arts' },
    steps: [
      { at: ['#tab-arts .art-slot', '#tab-arts'], title: 'Four moves and a passive',
        text: 'Every fight uses the arts you slot here. Study a manual to learn an art, then fill the slots.' },
      { at: ['#tab-arts .art-study', '#tab-arts .art-sec-h', '#tab-arts'], title: 'Studying takes time',
        text: 'Studying runs on a timer. Manuals come from breakthroughs, beasts, the arena and sect libraries.' },
    ] },
  { id: 'v_physique', group: 'cultivate', title: 'Body', trigger: { view: 'physique' },
    steps: [
      { at: ['#tab-physique'], title: 'Temper your body',
        text: 'Every life starts with a frail body. Tempering raises your tier from F to S: more Health, faster healing, stronger fists.' },
      { at: ['#tab-physique .fa-grid', '#tab-physique .fam-card', '#tab-physique'], title: 'Methods',
        text: 'Pick a method and let it run. Ordeals are faster but can hurt you. The mini-games are an optional boost.' },
    ] },

  // ── Roam ────────────────────────────────────────────────────────────────
  { id: 'v_explore', group: 'adventure', title: 'Expeditions', trigger: { view: 'explore' },
    steps: [
      { at: ['#tab-explore .loc-btn', '#tab-explore'], title: 'Set out',
        text: 'Send yourself on an expedition. It runs on a real-time timer and brings back herbs, ores and stones.' },
      { at: ['#tab-explore .er-card', '#tab-explore .section-title', '#tab-explore'], title: 'Met on the road',
        text: 'People you meet on the road wait here as cards. Each answer shows its odds, and they remember what you chose.' },
    ] },
  { id: 'v_beasts', group: 'adventure', title: 'Spirit beasts', trigger: { view: 'beasts' },
    steps: [
      { at: ['#tab-beasts'], title: 'Spirit beasts',
        text: 'Tap a beast for its details. Tame one with a talisman, or fight it for its parts.' },
    ] },
  { id: 'v_hunt', group: 'adventure', title: 'The Hunt', trigger: { view: 'hunt' },
    steps: [
      { at: ['#tab-hunt .hunt-btn', '#tab-hunt'], title: 'Track a beast',
        text: 'Pick a hunting ground and track a quarry. When the timer ends, you fight it on the battle page.' },
    ] },
  { id: 'v_bestiary', group: 'adventure', title: 'Bestiary', trigger: { view: 'bestiary' },
    steps: [
      { at: ['#tab-bestiary'], title: 'Bestiary',
        text: 'Every kind of beast you have met, where it lives and how it fights. Unknown kinds stay shadowed until you see them.' },
    ] },
  { id: 'v_arena', group: 'adventure', title: 'The Arena', trigger: { view: 'arena' },
    steps: [
      { at: ['#tab-arena .ar-card', '#tab-arena'], title: 'Six rings',
        text: 'Pay a ring\'s fee and fight duelists in a row. Your purse grows with each win. Walk away to keep it, or lose it all.' },
      { at: ['#tab-arena .ar-btn', '#tab-arena'], title: 'Blood matches',
        text: 'A blood match can kill either fighter. Read the odds before you choose.' },
    ] },
  // inBattle: plays over the battle page (every other lesson waits while any popup is open). Fights are turn-based:
  // the trigger is your move grid with a move you can pick, so nothing attacks while the card is up.
  { id: 'battle', group: 'adventure', title: 'Fighting', inBattle: true,
    trigger: { el: '#combat-overlay:not(.hidden) .cb-moves button:not(:disabled)' },
    opens: 'At your first battle',
    steps: [
      { at: ['#combat-overlay .cb-moves', '#combat-panel'], title: 'Your arts',
        text: 'Your four slotted arts. Each one costs combat Qi (the bar above). Keys 1 to 4 work too.' },
      { at: ['#combat-overlay [data-move="circulate"]', '#combat-overlay .cb-qi', '#combat-panel'], title: 'Circulate',
        text: 'Out of Qi? Circulate skips your attack to refill it.' },
      { at: ['#combat-stage', '#combat-panel'], title: 'Parry',
        text: 'When the enemy attacks, a ring closes on a mark. Tap, or press Space, as it closes: a parry blocks the hit and gives you Qi.' },
    ] },

  // ── Kin ─────────────────────────────────────────────────────────────────
  { id: 'v_family', group: 'kin', title: 'Family', trigger: { view: 'family' },
    steps: [
      { at: ['#tab-family .fam-card', '#tab-family'], title: 'Spouse and children',
        text: 'Courtship, marriage and children are your choices. Nothing here happens without you.' },
      { at: ['#tab-family'], title: 'Your heir',
        text: 'When this life ends, you are reborn into your bloodline. Raise your children well, because one of them will carry the clan.' },
    ] },
  { id: 'v_tree', group: 'kin', title: 'Family tree', trigger: { view: 'tree' },
    steps: [
      { at: ['#tab-tree'], title: 'Family tree',
        text: 'Your ancestors, your children and theirs. Tap anyone to open their card.' },
    ] },
  { id: 'v_clan', group: 'kin', title: 'Clan', trigger: { view: 'clan' },
    steps: [
      { at: ['#tab-clan'], title: 'Clan',
        text: 'The branches of your clan, its head and its feuds. The clan outlives every one of your lives.' },
    ] },
  { id: 'v_hall', group: 'kin', title: 'Ancestral Hall', trigger: { view: 'hall' },
    steps: [
      { at: ['#tab-hall'], title: 'Ancestral Hall',
        text: 'Each life earns Ancestral Merit. Spend it here on legacies that every later life inherits.' },
    ] },

  // ── Sect ────────────────────────────────────────────────────────────────
  { id: 'v_sect', group: 'sect', title: 'Sects', trigger: { view: 'sect' },
    steps: [
      { at: ['#tab-sect'], title: 'Join or found',
        text: 'Join a sect for its blessing, missions and library, or found your own once you are strong enough.' },
    ] },
  { id: 'v_sect_missions', needs: 'Join a sect first', group: 'sect', title: 'Sect missions', trigger: { view: 'sect-missions' },
    steps: [
      { at: ['#tab-sect-missions'], title: 'Missions',
        text: 'Timed tasks for your sect. They pay contribution and stones, and contribution raises your rank.' },
    ] },
  { id: 'v_sect_library', needs: 'Join a sect first', group: 'sect', title: 'Sect library', trigger: { view: 'sect-library' },
    steps: [
      { at: ['#tab-sect-library'], title: 'Library',
        text: 'Your sect\'s combat arts. Your rank decides which manuals you may borrow.' },
    ] },
  { id: 'v_sect_halls', needs: 'Found a sect first', group: 'sect', title: 'Halls', trigger: { view: 'sect-halls' },
    steps: [
      { at: ['#tab-sect-halls'], title: 'Halls',
        text: 'Build and deepen halls. Each level gives your sect a lasting bonus and costs more than the last.' },
    ] },
  { id: 'v_sect_base', needs: 'Found a sect first', group: 'sect', title: 'Your mountain', trigger: { view: 'sect-base' },
    steps: [
      { at: ['#tab-sect-base'], title: 'Your mountain',
        text: 'A view of your sect\'s compound. It grows as you raise halls and take in disciples.' },
    ] },
  { id: 'v_sect_disciples', needs: 'Found a sect first', group: 'sect', title: 'Disciples and branches', trigger: { view: 'sect-disciples' },
    steps: [
      { at: ['#tab-sect-disciples'], title: 'Disciples',
        text: 'Disciples earn your sect\'s income. Appoint a Branch Head and their branch recruits on its own, but a head you wrong may secede.' },
    ] },
  { id: 'v_sect_war', needs: 'Join or found a sect first', group: 'sect', title: 'War', trigger: { view: 'sect-war' },
    steps: [
      { at: ['#tab-sect-war'], title: 'War',
        text: 'Wars are fought by standing orders, so being away never loses you a war. Set your orders and see what rides on the outcome.' },
    ] },

  // ── Pack ────────────────────────────────────────────────────────────────
  { id: 'v_craft', group: 'pack', title: 'Crafting', trigger: { view: 'craft' },
    steps: [
      { at: ['#tab-craft'], title: 'The furnace',
        text: 'Turn materials into pills, elixirs and gear. Locked formulas must be found: some ring champions and strangers know them.' },
      { at: ['#tab-craft .craft-subtab[data-sub="elixirs"]', '#tab-craft'], title: 'Root elixirs',
        text: 'Re-forge your root (Path → Character): Cleansing turns Mixed into Dual half the time; Pure Root is mostly Pure, rarely Heavenly; Heavenly Root is 40% Heavenly.' },
    ] },
  { id: 'v_pack', group: 'pack', title: 'Items', trigger: { view: 'pack' },
    steps: [
      { at: ['#tab-pack'], title: 'Your pack',
        text: 'Everything you carry. Use, equip or sell from here. Filters and sorting are at the top.' },
    ] },

  // ── World ───────────────────────────────────────────────────────────────
  { id: 'v_world', group: 'log', title: 'Sects of the world', trigger: { view: 'world' },
    steps: [
      { at: ['#tab-world'], title: 'Sects of the world',
        text: 'Every sect lives on its own: it grows, wars and falls. Open a sect\'s page to gift, ally, trade or declare war.' },
    ] },
  { id: 'v_people', group: 'log', title: 'People', trigger: { view: 'people' },
    steps: [
      { at: ['#tab-people .pp-search', '#tab-people'], title: 'Everyone you know',
        text: 'Search and sort the people you have met. Star up to 12 to follow their lives closely.' },
      { at: ['#tab-people .pp-row', '#tab-people'], title: 'Their card',
        text: 'Tap a person for their card: what they think of you, why, and what you can do together.' },
    ] },
  { id: 'v_rival', group: 'log', title: 'Your rival', trigger: { view: 'rival' },
    steps: [
      { at: ['#tab-rival'], title: 'Your rival',
        text: 'One cultivator of your generation measures themselves against you. The heat meter runs from blood feud to kindred spirits.' },
    ] },
  { id: 'v_class', group: 'log', title: 'Your class', trigger: { view: 'class' },
    steps: [
      { at: ['#tab-class'], title: 'Your class',
        text: 'About sixty people awakened the same year you did. Watch how far each of them gets, and who falls.' },
    ] },
  { id: 'v_rankings', group: 'log', title: 'Heavenly Rankings', trigger: { view: 'rankings' },
    steps: [
      { at: ['#tab-rankings'], title: 'Heavenly Rankings',
        text: 'Published once a year. A high rank brings fame and invitations, but also challengers and genius hunters. You can veil your name.' },
    ] },
  { id: 'v_chronicle', group: 'log', title: 'Chronicle', trigger: { view: 'chronicle' },
    steps: [
      { at: ['#tab-chronicle'], title: 'Chronicle',
        text: 'The world\'s news: breakthroughs, deaths, wars and new sects. Tap a name to open that person.' },
    ] },
  { id: 'v_events', group: 'log', title: 'Events log', trigger: { view: 'events' },
    steps: [
      { at: ['#tab-events'], title: 'Events',
        text: 'Everything that happened to you, newest first. Each line names its cause.' },
    ] },
  { id: 'v_banter', group: 'log', title: 'Banter', trigger: { view: 'banter' },
    steps: [
      { at: ['#tab-banter'], title: 'Banter',
        text: 'Your cultivator\'s idle thoughts, in their own voice. Set how often they speak in Settings.' },
    ] },
]
