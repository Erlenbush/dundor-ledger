import type { OkFight } from '../types.js';
import { hp, plural } from '../format.js';

/**
 * Identity of the fight, plus the contrast that motivates the whole tool: the
 * one-line summary you normally get, against how much the log actually holds.
 */
export function FightBanner({ item }: { item: OkFight }) {
  const { fight, analysis: a } = item;
  const pMax = fight.maxHp[a.player];
  const mMax = fight.maxHp[a.monster];
  const won = fight.outcome.winner === a.player;

  // Reconstruct the summary for THIS outcome — never assume a win.
  const summary = fight.outcome.decided
    ? won
      ? [
          `You defeat the ${a.monster} in melee combat!`,
          `You won the fight in ${plural(a.totalTurns, 'turn')} with ${hp(a.finalPlayerHp, pMax)} HP left!`,
        ]
      : [`You are defeated by the ${a.monster}!`, `You lost the fight after ${plural(a.totalTurns, 'turn')}.`]
    : [`The fight ran ${plural(a.totalTurns, 'turn')} with no recorded outcome.`];

  return (
    <section>
      <div className="panel">
        <div className="banner">
          <div className="matchup">
            <span className="who p">{a.player}</span>
            <span className="vs">versus</span>
            <span className="who m">{a.monster}</span>
            <span className={`chip ${won ? 'w' : 'l'}`}>{won ? 'Victory' : 'Defeat'}</span>
          </div>
          <div className="meta-row">
            <span>Turns <b>{a.totalTurns}</b></span>
            <span>Opening distance <b>{fight.startDistance ?? '—'} tiles</b></span>
            <span>Closed at <b>turn {a.closedAt ?? '—'}</b></span>
            <span>First swing <b>turn {a.firstAttackTurn ?? '—'}</b></span>
            {a.startHpPct != null && a.startHpPct < 99.5 ? (
              <span>
                Entered <b className="warn">{hp(fight.startHp[a.player], pMax)} HP</b>
              </span>
            ) : null}
            <span>Ended <b>{hp(a.finalPlayerHp, pMax)} HP</b> vs <b>{hp(a.finalMonsterHp, mMax)} HP</b></span>
            {fight.ambush ? <span><b>{fight.firstMover}</b> opened unseen</span> : null}
          </div>
        </div>
        <div className="contrast">
          <div>
            <div className="lbl">The summary you normally get</div>
            <p className="summary-lines">
              {fight.startDistance != null ? (
                <span>
                  {a.player} explored a dungeon and spotted a {a.monster} at a distance of{' '}
                  {fight.startDistance} spaces!
                </span>
              ) : null}
              {summary.map((line) => <span key={line}>{line}</span>)}
            </p>
          </div>
          <div>
            <div className="lbl">What the log actually contains</div>
            <div className="bigstat">
              <span className="n">{a.events}</span>
              <span className="u">
                discrete events parsed<br />across {plural(a.turnsSeen.length, 'logged turn')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
