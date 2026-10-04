# Banter Writing Guide (Phase 29)
_The brief for anyone writing lines for `assets/data/banter-lines.js`. The engine is in `banter.md`._

## The voice
- A cheesy web-novel translation of xianxia, then someone says something stupid. **The joke is the contrast**
  between the grand cultivation register and petty, dumb or unhinged reality.
- **Every line should try to be funny.** A line that's only "in character" but not funny gets cut.
- **Swearing is allowed and encouraged where it's funny** (shit, fuck, damn, bastard, ass, hell). Swearing in
  archaic-translation voice is especially good: "This fucking Qi, may its ancestors be cursed for eighteen generations."
  Never use slurs, sexual content involving anyone underage, or real-world hate. The player can mask swearing
  with a setting, so write naturally.
- Short. The bubble sits over a 300 px sprite, so **aim for ≤ 90 characters, and never go over 140**. One or two beats.
- Speak as the cultivator, first person, talking to themselves or the player. No narration, no stage directions,
  no emoji. `…` is fine.
- Mix it up: questions, declarations, fake wisdom, callbacks to xianxia tropes (face-slapping, young masters,
  "you have eyes but can't see Mount Tai", heavenly tribulation, spirit stones, sect elders, jade slips, pill
  furnaces, bottleneck, dantian, meridians, courting death, "this Venerable").
- Don't repeat a joke structure more than twice inside one personality's pool.

## Tokens (only inside the triggers listed)
| Token | Meaning | Allowed in |
|---|---|---|
| `{name}` | the cultivator's own name | any trigger |
| `{stage}` | current stage name, e.g. "Foundation Building" | any trigger |
| `{item}` | the rare item just found | `rare_drop` only |
| `{hours}` | whole hours away, e.g. "9" | `welcome_back` only |
| `{enemy}` | enemy sect name (`war_*`); the ambusher's full name (`ambushed`) | `war_call`, `war_won`, `war_lost`, `ambushed` only |
| `{sect}` | your sect's name | `war_call`, `war_won`, `war_lost` only |
| `{beast}` | the beast's name, e.g. "White Tiger" (write "the {beast}") | `beast_slain`, `beast_spared`, `battle_lost` only |
| `{classmate}` | a classmate's given name (falls back to "an old classmate") | `classmate_fell`, `classmate_passed` only |
| `{master}` | the woken old monster's full name (falls back to "an old monster") | `hidden_master` only |

Use tokens in maybe 1 of 5 lines. Lines must read fine with any value substituted.

## Triggers (the counts are the minimum per personality)
| id | When it fires | Min |
|---|---|---|
| `idle` | Random chatter every few minutes while cultivating | 25 |
| `bt_success` | Just broke through to a new stage | 4 |
| `bt_fail` | Breakthrough failed (lost half their Qi) | 4 |
| `bt_fail_streak` | 3+ breakthrough failures in a row | 4 |
| `rare_drop` | Found a rare item on an expedition | 4 |
| `expedition_return` | Came back from an expedition (normal) | 4 |
| `low_health` | Health dropped below 30% | 4 |
| `war_call` | Their sect is going to war | 4 |
| `war_won` | War won | 4 |
| `war_lost` | War lost | 4 |
| `reborn` | First words of a NEW life after dying (reincarnated, vague memory of before) | 4 |
| `ascension_trial` | Looking at the Ascension Trial (survive and become immortal, or die) | 4 |
| `welcome_back` | The player reopened the game after hours away | 4 |
| `morning` | Real-world morning (5–10 am) | 4 |
| `night` | Real-world late night (11 pm–4 am). Teasing the player for being up is great | 4 |
| `beast_slain` | Finished off a beast after winning a battle | 4 |
| `beast_spared` | Spared a beaten beast, let it flee, or bound it as a companion | 4 |
| `battle_lost` | Lost a beast battle, or broke away from one | 4 |
| `arena_win` | Won a bout in the Arena (the purse grows; the crowd cheers) | 4 |
| `classmate_fell` | Phase 28 (4.3): someone who awakened the same year as you has died (the road, a feud, backlash…) | 4 |
| `classmate_passed` | Phase 28 (4.3): a classmate broke through past your realm | 4 |
| `hidden_master` | Phase 28 (4.6): an old monster broke a long seclusion (token `{master}`, their full name) | 4 |
| `ambushed` | Phase 28 (4.9): someone met on the road attacks you, or an avenger comes for you (token `{enemy}`, their full name) | 4 |
| `rival_rise` | Phase 28 (4.10b): your rival broke into a new realm (token `{rival}`, their given name) | 4 |
| `rank_rise` | Phase 28 (4.8): you entered the top ten of a ranking (tokens `{board}` e.g. "the Heaven Ranking", `{place}` e.g. "#7") | 4 |

## The 14 personalities
Each one is: id · name · voice in one line · what drives the jokes · two sample lines.

1. **arrogant** · Arrogant Young Master (傲慢少主) · Haughty, obsessed with face and his "status". Everything is beneath him, and he gets constantly humbled by trivial things. *"Hmph. This Qi is barely worthy of being absorbed by me."* / *"Who dares disturb this young master's meditation?! …Oh. A leaf."*
2. **coward** · Shameless Coward (厚颜胆小鬼) · Proud of running away and rebrands cowardice as wisdom. *"A true genius knows when to flee. I am a true genius."* / *"Retreat is also a kind of Dao. My kind."*
3. **hotblood** · Hot-Blooded Idiot (热血笨蛋) · LOUD, zero plan, wants to fight the sky. Caps lock is his inside voice. *"I WILL PUNCH THE HEAVENS! …After lunch."* / *"Tribulation lightning? FINALLY, A WORTHY OPPONENT!"*
4. **miser** · Iron Rooster Miser (铁公鸡) · Money-obsessed penny pincher who haggles with Heaven itself. *"Three spirit stones for ONE pill? Daylight robbery under the Nine fucking Heavens!"*
5. **glutton** · Bottomless Glutton (吃货) · Everything is food, and every cultivation concept is a food metaphor. *"Is eating spirit beast meat technically cultivation? I'm counting it."*
6. **poet** · Melodramatic Poet (多愁诗人) · Tragic, flowery verse about petty inconveniences. *"The wind weeps. The moon weeps. I, too, weep. My leg has fallen asleep."*
7. **stoic** · Deadpan Stoic (面瘫) · Flat, understated delivery of insane things. *"Breakthrough successful. I feel nothing. Also, my eyebrows are on fire."*
8. **demonking** · Self-Proclaimed Demon King (中二魔尊) · Chuunibyou: grandiose dark-lord cringe, sealed arm, nobody takes him seriously. *"Kneel, insects! …That was addressed to the ants. They did not kneel."*
9. **paranoid** · Paranoid Schemer (阴谋家) · Everything is a conspiracy, and he's always plotting counter-plots against squirrels. *"That crane has watched me for three incense sticks. Spy. Definitely a spy."*
10. **grumpy** · Grumpy Old Soul (倔老头) · Back-in-my-day curmudgeon who hates the youth, their roots, their pills and their music. *"In my day we cultivated uphill. Both ways. In the snow. Without roots."*
11. **lazy** · Lazy Genius (懒散天才) · Minimum effort, maximum excuses, naps are a technique. *"If I meditate lying down, it still counts. Heaven said so. Probably."*
12. **niceguy** · Genuinely Nice Guy (老好人) · Wholesome, supportive and polite. Compliments everyone including his enemies, the player and the tribulation. The joke is kindness in a genre built on murder. Warm, never dumb. Swears only by accident, then apologizes. *"Great job today! You clicked so bravely. I'm proud of us."* / *"I spared him and he stabbed me. Honestly? Fair. I hope he's doing well."*
13. **psycho** · Unhinged Psycho (疯魔) · Cheerfully murderous. Casual about horrifying things, talks about "collecting" things, laughs at wrong moments. Mood swings between sweet and deranged. Comic horror only, no gore detail and no real-world violence targets. *"I'm not angry. I'm just going to remember your face for ten thousand years. Hehe."* / *"Tribulation lightning tickles. Do it again. DO IT AGAIN."*
14. **gremlin** · Nonsense Gremlin (胡言乱语) · Pure absurdist non-sequiturs, made-up words, word salad, random sounds, cultivation terms used wrong. Think "borgin and gorgin". Surreal, confident, joyful nonsense. Some lines are only noises, some almost make sense and then don't. *"Borgin. Gorgin. The dantian is full of beans now."* / *"I have condensed my Qi into a small horse. His name is Gerald. He is also the Dao."*

## Output format (for the writing agents)
One JSON file per personality at the path you were given:
```json
{ "id": "psycho", "lines": { "idle": ["...", ...], "bt_success": ["..."], ... } }
```
Every trigger key must be present, meeting the minimum counts. No duplicates. Plain ASCII quotes inside lines are
fine; escape them properly for JSON.
