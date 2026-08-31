import React from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

// Replaces xrpl-desk.html's hand-rolled <canvas> dual-line chart with
// recharts (already a genai-risk-dashboard dependency) -- same idea (mid
// price + inventory over the last N ticks, two independent y-scales) done
// with a library instead of manual pixel math.
export default function MidInventoryChart({ history }) {
  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <p className="panel-title">
        Mid &amp; inventory <span className="count" style={{ color: 'var(--muted)' }}>last {history.length} ticks</span>
      </p>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={history} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
          <XAxis dataKey="i" hide />
          <YAxis yAxisId="mid" hide domain={['auto', 'auto']} />
          <YAxis yAxisId="inv" orientation="right" hide domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{ background: 'var(--panel-solid)', border: '1px solid var(--panel-border)', borderRadius: 8, fontSize: 11 }}
            labelFormatter={() => ''}
            formatter={(v, name) => [v.toFixed(4), name]}
          />
          <Line yAxisId="mid" type="monotone" dataKey="mid" stroke="var(--accent)" dot={false} strokeWidth={1.6} isAnimationActive={false} name="mid" />
          <Line yAxisId="inv" type="monotone" dataKey="inventory" stroke="var(--gold)" dot={false} strokeWidth={1.6} isAnimationActive={false} name="inventory" />
        </LineChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: 16, color: 'var(--muted)', fontSize: 11, marginTop: 6 }}>
        <span>
          <i style={{ display: 'inline-block', width: 10, height: 2, background: 'var(--accent)', verticalAlign: 'middle', marginRight: 5 }} />
          mid (RLUSD/XRP)
        </span>
        <span>
          <i style={{ display: 'inline-block', width: 10, height: 2, background: 'var(--gold)', verticalAlign: 'middle', marginRight: 5 }} />
          inventory (XRP)
        </span>
      </div>
    </section>
  );
}
