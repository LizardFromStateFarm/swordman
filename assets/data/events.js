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
      const lost = s.qi * 0.12
      s.qi -= lost
      return { text: `A demon beast disturbs your meditation. Lost ${fmtQi(lost)} Qi.`, type: 'negative' }
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
      s.karma = Math.max(0, s.karma - 12)
      s.qi *= 0.80
      return { text: 'An inner demon arises from suppressed desires. Karma -12, Qi -20%.', type: 'negative' }
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
        s.qi = Math.min(s.qi + s.derived.qiCap * 0.25, s.derived.qiCap)
        return { text: 'Stray heavenly lightning strikes you! Somehow you absorb it. Qi surges +25%.', type: 'special' }
      } else {
        s.qi *= 0.70
        return { text: 'Stray heavenly lightning scatters your Qi. Lost 30% Qi.', type: 'negative' }
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
