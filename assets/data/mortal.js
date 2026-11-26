// File: assets/data/mortal.js (Phase 49b — docs/systems/mortal-phase.md, "49b — The mortal arc").
// Mortal-only story beats: the village life lived before the Dao. A beat fires on the game clock only while the
// meridians are still shut (mortalMeridiansShut) and WAITS for the player's answer — nothing resolves itself.
// Every effect pays body XP in HOURS of the best tempering rate, so a beat auto-scales as realms rise.
// Data only. Used by: game-state.js (_tickMortal, _pickMortalBeat, mortalInfo, resolveMortalBeat, _mortalRival,
// the Explore forage _mortalForage), renderer/game.js (the Explore beat card + the Awakening card), attention.js.

const MORTAL_ARC = {
  firstBeatYears:  [0.3, 1.0],    // the first beat fires this many game years after a life begins
  beatGapYears:    [1.2, 2.2],    // …then this gap between beats (~2 open minutes a game year → a beat every ~2.5–4.5 min)
  maxBeats:        5,             // the most beats one mortal life sees — a short arc, not a grind
  sparkBeatAt:     1,             // `spark` needed before the capstone beat may fire
  exploreBonusPick: 1,            // an Explore return while mortal takes this many extra drop-table rolls
  exploreDrop:    { beast_core: 1 },   // …and this material, guaranteed (the drills' fodder)
  rivalRel:       -25,            // a childhood rival enters the world with this feeling toward you
  rivalBanter:    'mortal_rival',
}

// A beat's `when` gates it (all optional):
//   bodyMin/bodyMax  body-tier id ('F'…'S') · rootMultMin  spirit-root multiplier at or above
//   rootElement      one of your root's elements · orphan / clanBorn  how the life began
//   minStones        your Spirit Stones · sparkMin  accumulated `spark` · after/notAfter  beats already answered
// A choice's `effect`:
//   bodyHours (hours of the best temper rate) · items {id:qty} · stones · karma · health · headBond
//   spark (a memory) · hint (a flag) · rival (mint a childhood rival), with an optional `rel` (personality-keyed)
//   `karma`/`stones`/`rel` may be a number, or an object keyed by personality with a `default` (like the beating's
//   `bond`) — so the same beat reads differently for a hotblood and a stoic.
const MORTAL_BEATS = [
  {
    id: 'first_breath', title: 'The First Breath', first: true, weight: 1,
    text: 'You wake before the sun, and for a breath there is something in your chest — a thread, a thread of warmth that was not there yesterday. It is gone the moment you sit up. It was not a dream.',
    choices: [
      { id: 'chase', label: 'Follow the feeling', sub: '+0.5 h training · a spark you will keep',
        effect: { bodyHours: 0.5, spark: 1 },
        result: 'You sit until your legs go numb, chasing the thread. It slips away — but something in you has turned toward it, and will not turn back.' },
      { id: 'ask', label: 'Ask the village elder', sub: '+2 karma · he will tell you of the mountain sects',
        effect: { karma: 2, hint: 'elder' },
        result: 'The elder laughs, then sees your face and stops. He tells you of the sects on the mountain — of Qi, and the bodies that can hold it. “Your hands are soft,” he says. “That is the problem.”' },
      { id: 'ignore', label: 'Let it pass', sub: 'nothing — the morning is only cold',
        effect: {},
        result: 'You let it go. The morning is only cold, and there is water to fetch.' },
    ],
  },
  {
    id: 'the_smith', title: 'The Smith’s Forge', weight: 2,
    text: 'The village smith watches you haul his coal and snorts. “A scholar’s hands,” he says. “Wrists like reeds. If you mean to carry anything heavier than a bowl, you will have to earn it.”',
    choices: [
      { id: 'work', label: 'Work the forge all day', sub: '+1.2 h training · −6 Health',
        effect: { bodyHours: 1.2, health: -6 },
        result: 'By dusk your arms shake and your palms are one raw blister — but the hammer no longer feels like a stranger’s tool.' },
      { id: 'buy', label: 'Buy a beast core', sub: '−6 stones · +1 Beast Core for the drills', lock: 'Needs 6 Spirit Stones',
        effect: { stones: -6, items: { beast_core: 1 } },
        result: 'He spits, names a price, and drops the dull grey core into your palm. It is warm. It should not be warm.' },
      { id: 'decline', label: 'Keep to your own chores', sub: 'nothing',
        effect: {},
        result: 'You keep to your chores. He does not look up again.' },
    ],
  },
  {
    id: 'the_rival', title: 'The Boy From the Other End', weight: 2,
    text: 'A boy your age from the far end of the village has decided he does not like the way you stand. He has said so, loudly, in front of everyone.',
    choices: [
      { id: 'fight', label: 'Put him on the ground', sub: '+0.8 h training · he will remember',
        effect: { bodyHours: 0.8, rival: true, karma: { default: -1, hotblood: 1, psycho: 2 } },
        result: 'He is bigger. It does not matter. You are on top of him in the dust before either of you decides it, and the crowd goes quiet. He will remember this.' },
      { id: 'outwit', label: 'Answer with wit', sub: '+0.3 h · +3 karma · he will remember',
        effect: { bodyHours: 0.3, karma: { default: 3, poet: 5, stoic: 1 }, rival: true, rivalRel: 10 },
        result: 'You turn his words back on him and the crowd laughs — at him. He laughs too, a beat too late. He will remember this, and not kindly.' },
      { id: 'walk', label: 'Walk away', sub: 'nothing — but he follows',
        effect: { rival: true, rivalRel: 15 },
        result: 'You walk. He shouts after you, and for the next month he is always somewhere behind you, watching, deciding what you are.' },
    ],
  },
  {
    id: 'the_cultivator', title: 'A Sword at the Well', weight: 2,
    text: 'A traveller with a sword no villager could lift sits at the well. He looks at you for a long moment and says, “You have a root. A poor one, perhaps. But a root.”',
    choices: [
      { id: 'beg', label: 'Beg to be taken as a disciple', sub: '+1 karma · he tells you the way',
        effect: { karma: 1, hint: 'cultivator' },
        result: '“Not yet,” he says. “You are soft and unawakened. Temper the body — a body the Qi cannot break is a body that can hold it. Then climb the mountain and ask again.” He leaves.' },
      { id: 'test', label: 'Ask him to test your root', sub: '+0.4 h training · you learn what you carry',
        effect: { bodyHours: 0.4, hint: 'root' },
        result: 'He presses two fingers to your wrist, then your nape, and grunts. Whatever he finds, he does not say — but you walk home differently, turning it over.' },
      { id: 'bow', label: 'Bow, and say nothing', sub: '+3 karma',
        effect: { karma: 3 },
        result: 'You bow. He studies you a moment longer, then nods once — which is more than he gives the others.' },
    ],
  },
  {
    id: 'the_beast', title: 'Something at the Treeline', weight: 2, when: { bodyMin: 'E' },
    text: 'Something is killing the goats at the treeline, and tonight it has come close enough to see. Low, pale, too many joints. It has not yet decided about you.',
    choices: [
      { id: 'drive', label: 'Drive it off', sub: '+1.5 h · +1 Beast Core · −12 Health',
        effect: { bodyHours: 1.5, items: { beast_core: 1 }, health: -12 },
        result: 'You go at it with a pitchfork and the noise of a man twice your size. It tears your arm open, then breaks for the trees, leaving a smear of grey and a low cold weight where it slept. You keep the weight.' },
      { id: 'warn', label: 'Run and warn the village', sub: '+4 karma · +0.4 h',
        effect: { karma: 4, bodyHours: 0.4 },
        result: 'You run the whole village awake. The hunters drive it off at dawn with torches and shouting, and nobody is taken. “You did well,” they say, and mean it.' },
      { id: 'hide', label: 'Bar the door and wait', sub: 'nothing',
        effect: {},
        result: 'You shove the bar across the door and sit against it until grey light. Nothing comes. Nothing has to.' },
    ],
  },
  {
    id: 'the_river', title: 'The Black River', weight: 2,
    text: 'The river behind the village runs black and cold. Something pale glints on its bed, just far enough out that a grown man would not try it in spring.',
    choices: [
      { id: 'dive', label: 'Dive for it', sub: '+3 stones · −8 Health',
        effect: { stones: 3, health: -8 },
        result: 'The cold takes your breath and gives back a river-worn stone that hums faintly — a Spirit Stone, the elder will say, worth more than your family earns in a season. You are blue and shaking for an hour.' },
      { id: 'fish', label: 'Fish the shallows', sub: '+0.3 h · +2 Spirit Herbs',
        effect: { bodyHours: 0.3, items: { spirit_herb: 2 } },
        result: 'You wade the shallows with a spear until dark and come back with a string of fish and two pale roots the old women use for medicine.' },
      { id: 'sit', label: 'Sit and watch the water', sub: 'rest · +10 Health',
        effect: { health: 10 },
        result: 'You sit on the bank and watch the black water run, and let a day go by without asking anything of it. Your bruised body is the better for it.' },
    ],
  },
  {
    id: 'the_pedlar', title: 'The Pedlar’s Bottle', weight: 2,
    text: 'A pedlar with a mule and a rack of bottles has stopped at the crossroads. One bottle, dark glass, he will not let you touch: a body tonic, he says, “for the young and the hopeless.”',
    choices: [
      { id: 'buy', label: 'Buy the tonic', sub: '−8 stones · +1 h training', lock: 'Needs 8 Spirit Stones',
        effect: { stones: -8, bodyHours: 1.0 },
        result: 'It tastes of iron and burnt sugar and burns all the way down. By nightfall your muscles ache in a way that feels like work being done, and you sleep like the dead.' },
      { id: 'haggle', label: 'Haggle him down', sub: '−4 stones (if he likes you) · +1 h training',
        effect: { stones: { default: -4, miser: -6, niceguy: -3 }, bodyHours: 1.0 },
        result: 'You talk him down to half, which he enjoys more than the coin. The tonic still burns.' },
      { id: 'pass', label: 'Walk on', sub: 'nothing',
        effect: {},
        result: 'You walk on. He calls you a fool, in a friendly way, and the mule brays after you.' },
    ],
  },
  {
    id: 'the_element_dream', title: 'The Dream That Knows You', weight: 2, when: { rootMultMin: 1.4 },
    text: 'You dream, and the dream is not like the others. There is an element in it, and it knows your name. It offers itself to you the way a dog offers a paw.',
    choices: [
      { id: 'take', label: 'Take what it offers', sub: '+2 h training · a deep, strange sleep',
        effect: { bodyHours: 2.0, spark: 1 },
        result: 'You wake at noon with the taste of the element in your mouth and a body that fits you better than it did yesterday. The dream does not come again — once is all it is owed.' },
      { id: 'refuse', label: 'Refuse it', sub: '+4 karma · rest',
        effect: { karma: 4, health: 10 },
        result: 'You tell it no, in the dream, as plainly as you can. It seems, if anything, pleased. You wake rested, and lighter than before.' },
      { id: 'ask', label: 'Ask it what you are', sub: '+0.6 h training · a hint',
        effect: { bodyHours: 0.6, hint: 'element' },
        result: 'It shows you the shape of yourself — a small bright thing under a great deal of soft, sleepy flesh, waiting for the flesh to be worth it. Then you wake.' },
    ],
  },
  {
    id: 'the_empty_house', title: 'No One to Wake You', weight: 2, when: { orphan: true },
    text: 'There is no one to wake you and no one to feed you, and the village gives charity to the old and the mad and not to you. You are on your own — and your body is the only thing you own.',
    choices: [
      { id: 'labour', label: 'Take any work you can find', sub: '+1.4 h training · +1 stone',
        effect: { bodyHours: 1.4, stones: 1 },
        result: 'You carry, haul, dig and fetch for whoever will pay, from dark to dark, and come home so tired the pallet is a mercy. You are getting harder.' },
      { id: 'steal', label: 'Steal what you need', sub: '−3 karma · +2 stones',
        effect: { karma: -3, stones: 2 },
        result: 'You take bread and a coin-purse left on a sill. It is easy, and that is the worst thing about it.' },
      { id: 'beg', label: 'Beg at the temple steps', sub: '+1 karma · +0.3 h',
        effect: { karma: 1, bodyHours: 0.3 },
        result: 'The monks feed you once a day and let you sleep in the cold courtyard, and you spend the rest of the day climbing the thousand steps for no reason at all.' },
    ],
  },
  {
    id: 'the_clan_word', title: 'The Head Takes You Aside', weight: 2, when: { clanBorn: true },
    text: 'The head of the house takes you aside. “You have been seen to be idle,” he says. “You will not be idle. Whatever you are, you will be better than what you are — or you will be nothing.”',
    choices: [
      { id: 'obey', label: 'Swear to it', sub: '+1.2 h training · +10 bond with the head',
        effect: { bodyHours: 1.2, headBond: 10 },
        result: 'You swear it, and mean it, which surprises you both. He studies you and does not find you wanting — and that is a kind of warmth you have not had in this life.' },
      { id: 'defy', label: 'Tell him where to keep it', sub: '−12 bond · +0.5 h (you will pay for it)',
        effect: { karma: { default: -2, hotblood: 3, arrogant: 3, stoic: 1 }, headBond: -12, bodyHours: 0.5 },
        result: 'You say it flat, looking at him. There is a silence. Then he laughs — a short, cold thing — and walks off, and you have made yourself a stranger in the house you eat in.' },
      { id: 'accept', label: 'Take it as it is meant', sub: '−6 bond · +0.6 h',
        effect: { headBond: -6, bodyHours: 0.6 },
        result: 'You take it. There is nothing to say to a man who talks to you like a debt. You go to the yard and lift stones until your arms stop arguing.' },
    ],
  },
  {
    id: 'the_spark_returns', title: 'The Thread Comes Back', weight: 3, when: { sparkMin: 1 },
    text: 'It comes back — the thread in the chest, only stronger now, and it does not leave when you move. It is asking something of you. Sit with it, and you might open like a door. It will not wait forever.',
    choices: [
      { id: 'sit', label: 'Sit with it until dawn', sub: '+2.5 h training · the Awakening comes closer',
        effect: { bodyHours: 2.5, spark: 1 },
        result: 'You sit through the whole cold night without moving, and by grey light the thread has become a thin bright river running where your breath goes. You can feel the shape of the door. It only needs to be pushed.' },
      { id: 'rush', label: 'Force it open', sub: '+1.2 h training · −14 Health',
        effect: { bodyHours: 1.2, health: -14 },
        result: 'You drive your breath at the thread like a shoulder at a stuck gate. Something gives, and something tears, and you taste blood — but the river runs a little wider than before.' },
      { id: 'wait', label: 'Let it settle, and wait', sub: '+0.6 h training · +10 Health',
        effect: { bodyHours: 0.6, health: 10 },
        result: 'You breathe slow and let the thread do what it wants without your help. It thickens on its own, and your body heals around it. Patience is also a way.' },
    ],
  },
]
