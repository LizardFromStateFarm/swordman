// SECRET_REALMS — M8 Secret Realm Dungeons (Phase 17, docs/systems/world-flavor.md).
// A short push-your-luck run: enter, press deeper (loot + risk), rest, or leave. Data only. Read by
// renderer/engine/game-state.js (secretRealmInfo / enterSecretRealm / secretRealmStep) and renderExplore.
const SECRET_REALMS = [
  { id: 'mist_cave', name: 'The Mist Cave', minStage: 3, rooms: 3, cost: 20,
    desc: 'A cave that breathes cold fog; something inside counts your steps.',
    room: { stones: [8, 20], items: { spirit_herb: [1, 2], beast_core: [0, 1] }, damage: [4, 10] },
    final: { stones: [30, 60], item: 'artifact_fragment', qty: 1 } },
  { id: 'buried_palace', name: 'The Buried Palace', minStage: 10, rooms: 4, cost: 80,
    desc: 'The halls of a kingdom the desert swallowed. Its guards still keep their posts.',
    room: { stones: [25, 60], items: { ancient_script: [0, 1], demon_essence: [1, 2] }, damage: [10, 22] },
    final: { stones: [90, 160], item: 'ancient_script', qty: 2 } },
  { id: 'heaven_tomb', name: 'The Heaven Tomb', minStage: 19, rooms: 4, cost: 200,
    desc: 'A tomb built for something that refused to stay dead. The air tastes of ozone.',
    room: { stones: [70, 150], items: { void_crystal: [1, 2], chaos_essence: [0, 1] }, damage: [20, 40] },
    final: { stones: [250, 450], item: 'void_crystal', qty: 3 } },
]
