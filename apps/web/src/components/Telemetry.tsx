import type { OkFight } from '../types.js';
import { pct, plural } from '../format.js';
import { Tile } from './Tile.js';

/** Per-fight headline numbers. */
export function Telemetry({ item }: { item: OkFight }) {
  const { analysis: a } = item;
  const mine = a.stats[a.player]!;
  const mit = a.playerMitigation;
  const stalls = (a.stalled[a.player] ?? []).length;
  const combatTurns = a.firstAttackTurn ? a.totalTurns - a.firstAttackTurn + 1 : a.totalTurns;

  return (
    <section>
      <p className="eyebrow">Telemetry</p>
      <div className="tiles">
        <Tile label="Damage dealt" value={mine.dealt}
              sub={`${mine.rawRolled} rolled · ${a.monsterMitigation.absorbed} absorbed by it`}
              meterPct={(mine.dealt / Math.max(1, mine.rawRolled)) * 100} meterColor="var(--s1)" />
        <Tile label="Damage taken" value={mit.taken}
              sub={`from ${mit.incomingRaw} rolled against you`}
              meterPct={(mit.taken / Math.max(1, mit.incomingRaw)) * 100} meterColor="var(--s2)" />
        <Tile label="Mitigated" value={pct(mit.pct)}
              sub={`AC + resistances ate ${mit.absorbed} damage`}
              meterPct={mit.pct} meterColor="var(--good)" />
        <Tile label="Your hit rate" value={a.playerHitRate == null ? '—' : pct(a.playerHitRate)}
              sub={`${mine.hits} of ${plural(mine.attacks, 'swing')} landed`}
              meterPct={a.playerHitRate ?? 0} meterColor="var(--s1)" />
        <Tile label="Its hit rate" value={a.monsterHitRate == null ? '—' : pct(a.monsterHitRate)}
              sub={`${a.stats[a.monster]!.hits} of ${plural(a.stats[a.monster]!.attacks, 'swing')} landed`}
              meterPct={a.monsterHitRate ?? 0} meterColor="var(--s2)" />
        <Tile label="Overkill" value={a.overkill}
              sub={
                a.overkillOn === a.monster
                  ? `${pct((a.overkill / Math.max(1, mine.dealt)) * 100)} of your output wasted`
                  : a.overkillOn === a.player
                    ? 'dealt to you past the killing blow'
                    : 'nothing died'
              }
              meterPct={a.overkillOn ? (a.overkill / Math.max(1, a.overkillOn === a.monster ? mine.dealt : mit.taken)) * 100 : 0}
              meterColor="var(--warn)" />
        <Tile label="Turns idle" value={stalls}
              sub={stalls ? 'banked moves, no action' : 'never stalled'}
              meterPct={(stalls / Math.max(1, a.totalTurns)) * 100} meterColor="var(--warn)" />
        <Tile label="Approach"
              value={<>{a.approachTurns}<small> / {a.totalTurns}</small></>}
              sub={`${plural(combatTurns, 'turn')} of actual combat`}
              meterPct={(a.approachTurns / Math.max(1, a.totalTurns)) * 100} meterColor="var(--ink-3)" />
      </div>
    </section>
  );
}
