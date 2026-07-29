import { useCallback, useState } from 'react';
import { analyze, deriveInsights, parseFight, splitLogs } from '@dundor/parser';
import { isOk, type LoadedFight } from './types.js';
import { plural } from './format.js';
import { SAMPLE } from './sample.js';
import { CommandDeck } from './components/CommandDeck.js';
import { DamageChart } from './components/DamageChart.js';
import { FightBanner } from './components/FightBanner.js';
import { FightList } from './components/FightList.js';
import { HpChart } from './components/HpChart.js';
import { Ingest } from './components/Ingest.js';
import { Insights } from './components/Insights.js';
import { SessionTotals } from './components/SessionTotals.js';
import { StatBlocks } from './components/StatBlocks.js';
import { Telemetry } from './components/Telemetry.js';
import { TurnLog } from './components/TurnLog.js';

interface Source {
  label: string;
  text: string;
}

interface Status {
  text: string;
  error: boolean;
}

/** Parse one source into however many fights it holds. */
function expand(source: Source): LoadedFight[] {
  const chunks = splitLogs(source.text);
  return chunks.map((text, i) => {
    const label = chunks.length > 1 ? `${source.label} · fight ${i + 1}` : source.label;
    try {
      const fight = parseFight(text);
      const analysis = analyze(fight);
      return { label, fight, analysis, insights: deriveInsights(fight, analysis) };
    } catch (err) {
      return { label, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

const initial = expand({ label: 'Sample fight', text: SAMPLE });

/** Same phrasing the load path uses, so the first render doesn't read differently. */
function describe(fights: LoadedFight[]): string {
  const first = fights[0];
  if (!first || !isOk(first)) return 'Drop a log to begin.';
  return `Parsed ${first.analysis.events} events across ${plural(first.analysis.turnsSeen.length, 'turn')}.`;
}

export function App() {
  const [fights, setFights] = useState<LoadedFight[]>(initial);
  const [current, setCurrent] = useState(0);
  const [status, setStatus] = useState<Status>({ text: describe(initial), error: false });

  const load = useCallback((sources: Source[]) => {
    const parsed = sources.flatMap(expand);
    const ok = parsed.filter(isOk);
    const bad = parsed.length - ok.length;

    // Nothing usable. Report it, but leave whatever is on screen alone.
    if (!ok.length) {
      setStatus({
        error: true,
        text: parsed.length === 1 && !isOk(parsed[0]!)
          ? parsed[0]!.error
          : `Nothing in those ${parsed.length} sections is a Dundor fight log.`,
      });
      return;
    }

    setFights(parsed);
    setCurrent(parsed.indexOf(ok[0]!));
    const events = ok.reduce((n, f) => n + f.analysis.events, 0);
    setStatus({
      error: false,
      text: ok.length === 1
        ? `Parsed ${ok[0]!.analysis.events} events across ${plural(ok[0]!.analysis.turnsSeen.length, 'turn')}.`
        : `Parsed ${plural(ok.length, 'fight')}, ${events} events total.` +
          (bad ? ` ${plural(bad, 'section')} skipped.` : ''),
    });
  }, []);

  const onFiles = useCallback(async (files: File[]) => {
    const usable = files.filter((f) => !f.type || /text|plain/.test(f.type) || /\.txt$/i.test(f.name));
    if (!usable.length) {
      setStatus({ error: true, text: "Those aren't text files. Dundor attaches its logs as .txt." });
      return;
    }
    usable.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    load(await Promise.all(usable.map(async (f) => ({ label: f.name, text: await f.text() }))));
  }, [load]);

  const shown = fights[current];

  return (
    <div className="wrap">
      <header className="masthead">
        <div className="brand">Dundor · Battle Ledger</div>
        <h1>Everything the fight summary threw away.</h1>
        <p>
          Drop the <code className="inline">.txt</code> logs Dundor attaches and this reconstructs
          each fight: damage rolls, mitigation, move economy and wasted turns. Load a whole session
          at once and it totals them up.
        </p>
      </header>

      <Ingest
        onFiles={onFiles}
        onPaste={(text) => load([{ label: 'Pasted log', text }])}
        status={status}
        initialText={SAMPLE}
      />

      <FightList items={fights} current={current} onSelect={setCurrent} />
      <SessionTotals items={fights.filter(isOk)} />

      {shown && isOk(shown) ? (
        <>
          <FightBanner item={shown} />
          <Telemetry item={shown} />
          <Insights insights={shown.insights} />
          <HpChart item={shown} />
          <DamageChart item={shown} />
          <TurnLog item={shown} />
          <StatBlocks item={shown} />
        </>
      ) : null}

      <CommandDeck />

      <footer className="foot">
        <div>Everything runs in your browser. No log ever leaves this page.</div>
        <div>
          Dundor is a third-party Discord bot; this is an unofficial reader of output you already have.
        </div>
      </footer>
    </div>
  );
}
