// GENERATED — do not edit. Run `npm run sample` to rebuild.
//
// The XL 24 Lava Golem fight from fixtures/lava-golem-xl24.txt, with the player
// name, god and Discord user ID scrubbed. This file is compiled into the public
// bundle; the fixtures keep the real values for the parser tests.
//
// Combat numbers are untouched, so every derived figure still matches the
// original fight.
export const SAMPLE = `The fight happens between Adventurer and Lava Golem!
Stats for Adventurer ------------------------------------------------------------------------------------------
FightEntity:
  Moves Left: 0.0
  Hp Left: 231
  Mana Left: 13
  - stats:
    PlayerData:
      Hp: 231
      Mana: 13
      Rfire: 1
      Rcold: 1
      Rpois: 0
      Relec: 2
      Revil: 1
      Racid: 3
      Spirit: 1
      See Invis: 2
      Actual Hp Regen: 0.0
      Actual Mp Regen: 0.0
      Ac: 198
      Ev: 9
      Sh: 28
      Damages: [DamageInfo(type=:punch: physical, min_amount=60, max_amount=201), DamageInfo(type=:green_circle: poison, min_amount=15, max_amount=50)]
      Attack Speed: 1.09
      Melee Accuracy: 4.0
      Fight Effect Use Chance: 0.0
      Available Fight Effects: []
      Sneak Chance: 0.0
      Stab Multiplier: 1.5
      Effects Can Be Silenced: False
      On Hit Effects: [OnHitEffect(effect_id=0, chance=20.0, power=5)]
      Name: Adventurer
      Effect Power Level: 0
      Spells: []
      User Id: 000000000000000000
      Resurrection: 2
      God: Anonymous
      Str : 57
      Dex: 10
      Int : 12
      Xl: 24
  Melee Evade Chance: 28.905049737499603
  Spell Evade Chances: N/A (opponent has no spells)
  Name: Adventurer
  Is Silenced: False
  Affected By Holy Damage: False
Stats for Lava Golem ------------------------------------------------------------------------------------------
FightEntity:
  Moves Left: 0.0
  Hp Left: 200
  Mana Left: 0
  - stats:
    MonsterData:
      Hp: 200
      Mana: 0
      Rfire: 4
      Rcold: -2
      Rpois: 2
      Relec: 0
      Revil: 0
      Racid: 0
      Spirit: 0
      See Invis: False
      Actual Hp Regen: 0.0
      Actual Mp Regen: 0.0
      Ac: 10
      Ev: 25
      Sh: 25
      Damages: [DamageInfo(type=:punch: physical, min_amount=4, max_amount=15), DamageInfo(type=:fire: fire, min_amount=30, max_amount=100)]
      Attack Speed: 1.0
      Melee Accuracy: 1
      Fight Effect Use Chance: 0.0
      Available Fight Effects: []
      Sneak Chance: 0.0
      Stab Multiplier: 0.0
      Effects Can Be Silenced: False
      On Hit Effects: []
      Name: Lava Golem
      Effect Power Level: 0
  Melee Evade Chance: 26.894142136999513
  Spell Evade Chances: N/A (opponent has no spells)
  Name: Lava Golem
  Is Silenced: False
  Affected By Holy Damage: False
Logs ------------------------------------------------------------------------------------------
The distance between you is 7 tiles.
[Adventurer] starts first because [Lava Golem] hasn't noticed them yet.
TURN 1 ------------------------------------------------------------------------------------------
[Adventurer] sneaks 1 space closer but alerts [Lava Golem]! Distance left = 6. Turn ended for [Adventurer].
[Lava Golem] gains 1.0 moves. Moves left = 1.0. HP left: 200/200. Mana left: 0/0.
[Lava Golem] moves 1 space closer to [Adventurer]. Distance left = 5.
[Lava Golem] uses 1.0 moves! Moves left = 0.0.
TURN 3 ------------------------------------------------------------------------------------------
[Adventurer] gains 1.0 moves. Moves left = 1.0. HP left: 231/231. Mana left: 13/13.
[Adventurer] moves 1 space closer to [Lava Golem]. Distance left = 4.
[Adventurer] uses 1.0 moves! Moves left = 0.0.
TURN 4 ------------------------------------------------------------------------------------------
[Lava Golem] gains 1.0 moves. Moves left = 1.0. HP left: 200/200. Mana left: 0/0.
[Lava Golem] moves 1 space closer to [Adventurer]. Distance left = 3.
[Lava Golem] uses 1.0 moves! Moves left = 0.0.
TURN 5 ------------------------------------------------------------------------------------------
[Adventurer] gains 1.0 moves. Moves left = 1.0. HP left: 231/231. Mana left: 13/13.
[Adventurer] moves 1 space closer to [Lava Golem]. Distance left = 2.
[Adventurer] uses 1.0 moves! Moves left = 0.0.
TURN 6 ------------------------------------------------------------------------------------------
[Lava Golem] gains 1.0 moves. Moves left = 1.0. HP left: 200/200. Mana left: 0/0.
[Lava Golem] moves 1 space closer to [Adventurer]. Distance left = 1.
[Lava Golem] uses 1.0 moves! Moves left = 0.0.
TURN 7 ------------------------------------------------------------------------------------------
[Adventurer] gains 1.0 moves. Moves left = 1.0. HP left: 231/231. Mana left: 13/13.
[Adventurer] moves 1 space closer to [Lava Golem]. Distance left = 0.
[Adventurer] uses 1.0 moves! Moves left = 0.0.
TURN 8 ------------------------------------------------------------------------------------------
[Lava Golem] gains 1.0 moves. Moves left = 1.0. HP left: 200/200. Mana left: 0/0.
[Lava Golem] hits [Adventurer] with a melee attack! Applying each damage. [evade roll: 96.38253 > 28.90505].
[Lava Golem] rolls 5 for :punch: physical!
[Adventurer] rolls 175 for AC and reduces the damage by 175! Damage Left = 1
[Adventurer] gets damaged by 1 damage! HP Left = 230/231.
[Lava Golem] rolls 59 for :fire: fire!
[Adventurer] reduces the damage by 16.67% because of their resistance to this element! Damage Left = 50
[Adventurer] rolls 157 for AC and reduces the damage by 157! Damage Left = 1
[Adventurer] gets damaged by 1 damage! HP Left = 229/231.
[Lava Golem] uses 1.00 moves! Moves left = 0.0.
TURN 9 ------------------------------------------------------------------------------------------
[Adventurer] gains 1.0 moves. Moves left = 1.0. HP left: 229/231. Mana left: 13/13.
TURN 10 ------------------------------------------------------------------------------------------
[Lava Golem] gains 1.0 moves. Moves left = 1.0. HP left: 200/200. Mana left: 0/0.
[Lava Golem] hits [Adventurer] with a melee attack! Applying each damage. [evade roll: 85.77439 > 28.90505].
[Lava Golem] rolls 13 for :punch: physical!
[Adventurer] rolls 177 for AC and reduces the damage by 177! Damage Left = 1
[Adventurer] gets damaged by 1 damage! HP Left = 228/231.
[Lava Golem] rolls 75 for :fire: fire!
[Adventurer] reduces the damage by 16.67% because of their resistance to this element! Damage Left = 63
[Adventurer] rolls 147 for AC and reduces the damage by 147! Damage Left = 1
[Adventurer] gets damaged by 1 damage! HP Left = 227/231.
[Lava Golem] uses 1.00 moves! Moves left = 0.0.
TURN 11 ------------------------------------------------------------------------------------------
[Adventurer] gains 1.0 moves. Moves left = 2.0. HP left: 227/231. Mana left: 13/13.
[Adventurer] hits [Lava Golem] with a melee attack! Applying each damage. [evade roll: 26.90816 > 26.89414].
[Adventurer] rolls 104 for :punch: physical!
[Lava Golem] rolls 7 for AC and reduces the damage by 7! Damage Left = 97
[Lava Golem] gets damaged by 97 damage! HP Left = 103/200.
[Adventurer] rolls 34 for :green_circle: poison!
[Lava Golem] reduces the damage by 33.33% because of their resistance to this element! Damage Left = 23
[Lava Golem] rolls 5 for AC and reduces the damage by 5! Damage Left = 18
[Lava Golem] gets damaged by 18 damage! HP Left = 85/200.
[Adventurer] uses 1.09 moves! Moves left = 0.9099999999999999.
TURN 12 ------------------------------------------------------------------------------------------
[Lava Golem] gains 1.0 moves. Moves left = 1.0. HP left: 85/200. Mana left: 0/0.
[Lava Golem] hits [Adventurer] with a melee attack! Applying each damage. [evade roll: 69.17595 > 28.90505].
[Lava Golem] rolls 6 for :punch: physical!
[Adventurer] rolls 120 for AC and reduces the damage by 120! Damage Left = 1
[Adventurer] gets damaged by 1 damage! HP Left = 226/231.
[Lava Golem] rolls 49 for :fire: fire!
[Adventurer] reduces the damage by 16.67% because of their resistance to this element! Damage Left = 41
[Adventurer] rolls 123 for AC and reduces the damage by 123! Damage Left = 1
[Adventurer] gets damaged by 1 damage! HP Left = 225/231.
[Lava Golem] uses 1.00 moves! Moves left = 0.0.
TURN 13 ------------------------------------------------------------------------------------------
[Adventurer] gains 1.0 moves. Moves left = 1.91. HP left: 225/231. Mana left: 13/13.
[Adventurer] tries attacking in melee but misses! [evade roll: 5.05361 <= 26.89414]
[Adventurer] uses 1.09 moves! Moves left = 0.8199999999999998.
TURN 14 ------------------------------------------------------------------------------------------
[Lava Golem] gains 1.0 moves. Moves left = 1.0. HP left: 85/200. Mana left: 0/0.
[Lava Golem] hits [Adventurer] with a melee attack! Applying each damage. [evade roll: 86.48230 > 28.90505].
[Lava Golem] rolls 10 for :punch: physical!
[Adventurer] rolls 155 for AC and reduces the damage by 155! Damage Left = 1
[Adventurer] gets damaged by 1 damage! HP Left = 224/231.
[Lava Golem] rolls 82 for :fire: fire!
[Adventurer] reduces the damage by 16.67% because of their resistance to this element! Damage Left = 69
[Adventurer] rolls 160 for AC and reduces the damage by 160! Damage Left = 1
[Adventurer] gets damaged by 1 damage! HP Left = 223/231.
[Lava Golem] uses 1.00 moves! Moves left = 0.0.
TURN 15 ------------------------------------------------------------------------------------------
[Adventurer] gains 1.0 moves. Moves left = 1.8199999999999998. HP left: 223/231. Mana left: 13/13.
[Adventurer] tries attacking in melee but misses! [evade roll: 2.03067 <= 26.89414]
[Adventurer] uses 1.09 moves! Moves left = 0.7299999999999998.
TURN 16 ------------------------------------------------------------------------------------------
[Lava Golem] gains 1.0 moves. Moves left = 1.0. HP left: 85/200. Mana left: 0/0.
[Lava Golem] hits [Adventurer] with a melee attack! Applying each damage. [evade roll: 31.49688 > 28.90505].
[Lava Golem] rolls 4 for :punch: physical!
[Adventurer] rolls 102 for AC and reduces the damage by 102! Damage Left = 1
[Adventurer] gets damaged by 1 damage! HP Left = 222/231.
[Lava Golem] rolls 79 for :fire: fire!
[Adventurer] reduces the damage by 16.67% because of their resistance to this element! Damage Left = 66
[Adventurer] rolls 164 for AC and reduces the damage by 164! Damage Left = 1
[Adventurer] gets damaged by 1 damage! HP Left = 221/231.
[Lava Golem] uses 1.00 moves! Moves left = 0.0.
TURN 17 ------------------------------------------------------------------------------------------
[Adventurer] gains 1.0 moves. Moves left = 1.7299999999999998. HP left: 221/231. Mana left: 13/13.
[Adventurer] tries attacking in melee but misses! [evade roll: 17.38424 <= 26.89414]
[Adventurer] uses 1.09 moves! Moves left = 0.6399999999999997.
TURN 18 ------------------------------------------------------------------------------------------
[Lava Golem] gains 1.0 moves. Moves left = 1.0. HP left: 85/200. Mana left: 0/0.
[Lava Golem] hits [Adventurer] with a melee attack! Applying each damage. [evade roll: 32.08722 > 28.90505].
[Lava Golem] rolls 12 for :punch: physical!
[Adventurer] rolls 175 for AC and reduces the damage by 175! Damage Left = 1
[Adventurer] gets damaged by 1 damage! HP Left = 220/231.
[Lava Golem] rolls 40 for :fire: fire!
[Adventurer] reduces the damage by 16.67% because of their resistance to this element! Damage Left = 34
[Adventurer] rolls 146 for AC and reduces the damage by 146! Damage Left = 1
[Adventurer] gets damaged by 1 damage! HP Left = 219/231.
[Lava Golem] uses 1.00 moves! Moves left = 0.0.
TURN 19 ------------------------------------------------------------------------------------------
[Adventurer] gains 1.0 moves. Moves left = 1.6399999999999997. HP left: 219/231. Mana left: 13/13.
[Adventurer] hits [Lava Golem] with a melee attack! Applying each damage. [evade roll: 73.06207 > 26.89414].
[Adventurer] rolls 86 for :punch: physical!
[Lava Golem] rolls 5 for AC and reduces the damage by 5! Damage Left = 81
[Lava Golem] gets damaged by 81 damage! HP Left = 4/200.
[Adventurer] rolls 32 for :green_circle: poison!
[Lava Golem] reduces the damage by 33.33% because of their resistance to this element! Damage Left = 22
[Lava Golem] rolls 7 for AC and reduces the damage by 7! Damage Left = 15
[Lava Golem] gets damaged by 15 damage! HP Left = -11/200.
[Adventurer] uses 1.09 moves! Moves left = 0.5499999999999996.
[Lava Golem] dies!
[Adventurer] wins the fight because [Lava Golem] has died!`;
