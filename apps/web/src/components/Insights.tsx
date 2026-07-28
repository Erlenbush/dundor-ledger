import type { Insight } from '@dundor/parser';
import { Rich } from './Rich.js';

export function Insights({ insights }: { insights: Insight[] }) {
  if (!insights.length) return null;
  return (
    <section>
      <p className="eyebrow">The read</p>
      <h2 className="title">What actually decided this fight</h2>
      <div className="reads">
        {insights.map((it) => (
          <article key={it.id} className={`read sev-${it.severity}`}>
            <div className="tag">{it.tag}</div>
            <div>
              <h3>{it.headline}</h3>
              <p><Rich text={it.body} /></p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
