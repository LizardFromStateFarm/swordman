// Random cultivation events that fire periodically during gameplay.
// apply(state, gameState) mutates state and returns { text, type }.
// type: 'positive' | 'negative' | 'special' | 'neutral'

const RANDOM_EVENTS = [
  {
    id: 'spirit_spring', weight: 8, minStage: 0,
    name: 'Spirit Spring Discovered',
    apply(s, gs) {
      const bonus = s.derived.qiPerSecond * 30
      s.qi = Math.min(s.qi + bonus, s.derived.qiCap)
      return { text: `A hidden spirit spring bubbles up beneath you! Absorbed ${fmtQi(bonus)} Qi.`, type: 'positive' }
    }
  },
  {
    id: 'passing_senior', weight: 5, minStage: 1,
    name: 'Passing Senior Cultivator',
    apply(s, gs) {
      s.karma = Math.min(100, s.karma + 8)
      return { text: 'A senior cultivator passes by and bestows a blessing. Karma +8.', type: 'special' }
    }
  },
  {
    id: 'demon_disturbance', weight: 6, minStage: 2,
    name: 'Demon Disturbance',
    apply(s, gs) {
      // Losses are "seconds of cultivation", never % of current Qi — % losses create a ceiling below the
      // breakthrough threshold once a stage takes longer than ~30 min to fill (found by npm run sim).
      const lost = Math.min(s.qi, s.derived.qiPerSecond * 60)
      s.qi -= lost
      return { text: `A demon beast's roar shatters your meditation. ${fmtQi(lost)} Qi scatters into the wind.`, type: 'negative' }
    }
  },
  {
    id: 'heavenly_insight', weight: 3, minStage: 3,
    name: 'Heavenly Insight',
    apply(s, gs) {
      s.karma = Math.min(100, s.karma + 15)
      s.comprehension = (s.comprehension || 0) + 1
      return { text: 'A flash of heavenly insight strikes your mind! Karma +15, Comprehension +1.', type: 'special' }
    }
  },
  {
    id: 'spirit_stone_vein', weight: 4, minStage: 2,
    name: 'Spirit Stone Vein',
    apply(s, gs) {
      const stones = 2 + Math.floor(s.stageIndex / 3)
      s.spiritStones += stones
      return { text: `You unearth a small spirit stone vein. Gained ${stones} spirit stones.`, type: 'positive' }
    }
  },
  {
    id: 'inner_demon', weight: 5, minStage: 5,
    name: 'Inner Demon Manifestation',
    apply(s, gs) {
      const lost = Math.min(s.qi, s.derived.qiPerSecond * 120)
      s.karma = Math.max(0, s.karma - 12)
      s.qi -= lost
      // At high realms (Nascent Soul+) the inner demon can wound the body, not just the cultivation (Phase 23A).
      let healthNote = ''
      if (s.stageIndex >= 16) {
        const dmg = 4 + Math.floor(Math.random() * 5)
        s.health = Math.max(0, (s.health ?? 100) - dmg)
        healthNote = ` Health -${dmg}.`
      }
      return { text: `An inner demon rises from suppressed desires, gnawing at your dantian. Karma -12, Qi -${fmtQi(lost)}.${healthNote}`, type: 'negative' }
    }
  },
  {
    id: 'auspicious_cloud', weight: 4, minStage: 0,
    name: 'Auspicious Cloud',
    apply(s, gs) {
      const bonus = s.derived.qiPerSecond * 60
      s.qi = Math.min(s.qi + bonus, s.derived.qiCap)
      s.karma = Math.min(100, s.karma + 5)
      return { text: `An auspicious cloud passes overhead and bestows Qi. +${fmtQi(bonus)} Qi, Karma +5.`, type: 'positive' }
    }
  },
  {
    id: 'heavenly_lightning', weight: 2, minStage: 4,
    name: 'Stray Heavenly Lightning',
    apply(s, gs) {
      if (Math.random() < 0.5) {
        // Time-based (5 min of Qi), not % of cap — also safe at Ascension where qiCap = Infinity
        const surge = s.derived.qiPerSecond * 300
        s.qi = Math.min(s.qi + surge, s.derived.qiCap)
        return { text: `Stray heavenly lightning strikes you! Somehow you drink it down. Qi surges +${fmtQi(surge)}.`, type: 'special' }
      } else {
        const lost = Math.min(s.qi, s.derived.qiPerSecond * 180)
        s.qi -= lost
        return { text: `Stray heavenly lightning tears through your meridians. ${fmtQi(lost)} Qi is scattered.`, type: 'negative' }
      }
    }
  },
]

function fmtQi(n) {
  if (n >= 1e9) return (n/1e9).toFixed(1)+'B'
  if (n >= 1e6) return (n/1e6).toFixed(1)+'M'
  if (n >= 1e3) return (n/1e3).toFixed(1)+'K'
  return Math.floor(n).toString()
}
