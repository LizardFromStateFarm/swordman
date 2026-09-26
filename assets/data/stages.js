// Cultivation stages — every row is one "layer" the cultivator advances through.
// stageIndex in GameState maps to index in this array.
// Foundation Building+ qiCaps retuned 2026-09-26 (M2 task 2.4, life-loop.md §6) so a casual mortal LIFE
// (not just cumulative pacing) lands in the 10–20 open-hour band and reaches Spirit Severing / an
// Ascension attempt within that life, given the Phase 30 game clock (lifespan.js) now ends a life by
// old age well before the previous, looser caps let a casual player out of Core Formation. Casual's
// unboosted idle time to fill each cap now lands in life-loop.md §6.2's tighter bands: FB 15–30m,
// CF 30–60m, NS 45–90m, SS 60–120m (see scripts/sim/profiles.js PACING_TARGETS_MIN). QC/Mortal caps
// unchanged (§6.1: casual's 30-min check-in cadence already floors QC at ~4.5h regardless of cap).
// Re-run `npm run sim` after changing baseQps, qiCap or any Qi/s multiplier.

const CULTIVATION_STAGES = [
  // ── MORTAL ───────────────────────────────────────────────────────────────
  {
    id: 'mortal', realm: 'Mortal', realmCN: '凡人',
    layer: 'Unawakened', layerCN: '未觉醒',
    baseQps: 0.5, qiCap: 100, breakthroughChance: 0.95,
    color: '#8A7560', spriteState: 'idle',
    desc: 'A mortal who has yet to feel the calling of the Dao.',
  },

  // ── QI CONDENSATION (9 layers) ───────────────────────────────────────────
  ...Array.from({ length: 9 }, (_, i) => {
    const phases = ['Early','Early','Early','Middle','Middle','Middle','Late','Late','Late']
    const cnNums  = ['一','二','三','四','五','六','七','八','九']
    return {
      id: `qi_cond_${i+1}`, realm: 'Qi Condensation', realmCN: '聚气期',
      layer: `${phases[i]} Stage — Layer ${i+1}`, layerCN: `第${cnNums[i]}层`,
      baseQps: 1 * Math.pow(1.5, i), qiCap: Math.round(200 * Math.pow(2.2, i)),
      breakthroughChance: 0.90 - i * 0.03,
      color: '#87CEEB', spriteState: 'meditating',
      desc: `Gathering Qi of heaven and earth — ${phases[i].toLowerCase()} stage.`,
    }
  }),

  // ── FOUNDATION BUILDING ──────────────────────────────────────────────────
  { id:'fb_early', realm:'Foundation Building', realmCN:'筑基期', layer:'Early Stage', layerCN:'初期',
    baseQps:60, qiCap:3.12e5, breakthroughChance:0.70, color:'#4A90D9', spriteState:'meditating_deep',
    desc:'The foundation of the Dao is laid within the body.' },
  { id:'fb_mid', realm:'Foundation Building', realmCN:'筑基期', layer:'Middle Stage', layerCN:'中期',
    baseQps:180, qiCap:1.38e6, breakthroughChance:0.65, color:'#4A90D9', spriteState:'meditating_deep',
    desc:'Meridians expand to hold greater power.' },
  { id:'fb_late', realm:'Foundation Building', realmCN:'筑基期', layer:'Late Stage', layerCN:'后期',
    baseQps:500, qiCap:5.82e6, breakthroughChance:0.60, color:'#4A90D9', spriteState:'meditating_deep',
    desc:'Perfection of the Foundation approaches.' },

  // ── CORE FORMATION ───────────────────────────────────────────────────────
  { id:'cf_early', realm:'Core Formation', realmCN:'结丹期', layer:'Early Stage', layerCN:'初期',
    baseQps:1200, qiCap:1.98e7, breakthroughChance:0.55, color:'#9B59B6', spriteState:'levitating',
    desc:'A golden core crystallises within the dantian.' },
  { id:'cf_mid', realm:'Core Formation', realmCN:'结丹期', layer:'Middle Stage', layerCN:'中期',
    baseQps:3500, qiCap:1.8e8, breakthroughChance:0.50, color:'#9B59B6', spriteState:'levitating',
    desc:'The core resonates with the laws of heaven.' },
  { id:'cf_late', realm:'Core Formation', realmCN:'结丹期', layer:'Late Stage', layerCN:'后期',
    baseQps:9000, qiCap:9.45e8, breakthroughChance:0.45, color:'#9B59B6', spriteState:'levitating',
    desc:'The core glows with blinding golden light.' },

  // ── NASCENT SOUL ─────────────────────────────────────────────────────────
  { id:'ns_early', realm:'Nascent Soul', realmCN:'元婴期', layer:'Early Stage', layerCN:'初期',
    baseQps:25000, qiCap:1.34e9, breakthroughChance:0.40, color:'#FFD700', spriteState:'transcending',
    desc:'A nascent soul emerges from the golden core.' },
  { id:'ns_mid', realm:'Nascent Soul', realmCN:'元婴期', layer:'Middle Stage', layerCN:'中期',
    baseQps:70000, qiCap:7.0e9, breakthroughChance:0.35, color:'#FFD700', spriteState:'transcending',
    desc:'The nascent soul grows more corporeal.' },
  { id:'ns_late', realm:'Nascent Soul', realmCN:'元婴期', layer:'Late Stage', layerCN:'后期',
    baseQps:200000, qiCap:4.2e10, breakthroughChance:0.30, color:'#FFD700', spriteState:'transcending',
    desc:'The nascent soul can leave the body and roam the world.' },

  // ── SPIRIT SEVERING ──────────────────────────────────────────────────────
  { id:'ss_early', realm:'Spirit Severing', realmCN:'化神期', layer:'Early Stage', layerCN:'初期',
    baseQps:6e5, qiCap:1.169e11, breakthroughChance:0.25, color:'#CC2936', spriteState:'transcending',
    desc:'The Dao heart is severed from mortal attachments.' },
  { id:'ss_mid', realm:'Spirit Severing', realmCN:'化神期', layer:'Middle Stage', layerCN:'中期',
    baseQps:2e6, qiCap:7.65e11, breakthroughChance:0.22, color:'#CC2936', spriteState:'transcending',
    desc:'Laws of heaven and earth bend to your will.' },
  { id:'ss_late', realm:'Spirit Severing', realmCN:'化神期', layer:'Late Stage', layerCN:'后期',
    baseQps:6e6, qiCap:5.29e12, breakthroughChance:0.20, color:'#CC2936', spriteState:'transcending',
    desc:'The spirit merges with the void between realms.' },

  // ── ASCENSION ────────────────────────────────────────────────────────────
  {
    id: 'ascension', realm: 'Ascension', realmCN: '飞升',
    layer: 'Immortal', layerCN: '仙人',
    baseQps: 2e7, qiCap: Infinity, breakthroughChance: 0,
    color: '#F0E68C', spriteState: 'transcending',
    desc: 'You have transcended mortality. The immortal realm awaits.',
  },
]
