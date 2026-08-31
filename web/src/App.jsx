import React, { useState } from 'react';
import RiskAnalyticsBoard from './components/RiskAnalyticsBoard.jsx';
import XrplDesk from './components/XrplDesk.jsx';

const TABS = [
  { key: 'analytics', label: 'Risk Analytics Board' },
  { key: 'desk', label: 'XRPL Desk' },
];

export default function App() {
  const [tab, setTab] = useState('analytics');

  return (
    <div className="app-shell">
      <div className="tab-bar">
        {TABS.map((t) => (
          <div
            key={t.key}
            className={`tab-item ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </div>
        ))}
      </div>

      {tab === 'analytics' && <RiskAnalyticsBoard />}
      {tab === 'desk' && <XrplDesk />}

      <div className="footer">
        <span className="eyebrow" style={{ fontSize: 10.5 }}>
          qgl-xrpl — XRPL venue module · React port of dashboards/*.html
        </span>
        <div className="eyebrow" style={{ fontSize: 10, marginTop: 4, opacity: 0.8 }}>
          Testnet-only demonstration. Not calibrated for production use — see docs/integration-plan.md.
        </div>
      </div>
    </div>
  );
}
