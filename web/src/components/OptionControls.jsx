import React from 'react';

export default function OptionControls({ params, onChange, onShock, autoOn, onToggleAuto }) {
  const set = (key) => (e) => onChange({ ...params, [key]: e.target.value });

  return (
    <div className="controls">
      <div className="field">
        <label>Strike K</label>
        <input type="number" step="0.05" value={params.K} onChange={set('K')} />
      </div>
      <div className="field">
        <label>Vol σ</label>
        <input type="number" step="0.05" value={params.sig} onChange={set('sig')} />
      </div>
      <div className="field">
        <label>Rate r</label>
        <input type="number" step="0.01" value={params.r} onChange={set('r')} />
      </div>
      <div className="field">
        <label>Carry q</label>
        <input type="number" step="0.01" value={params.q} onChange={set('q')} />
      </div>
      <div className="field">
        <label>Expiry T (yr)</label>
        <input type="number" step="0.05" value={params.T} onChange={set('T')} />
      </div>
      <div className="field">
        <label>Type</label>
        <select value={params.typ} onChange={set('typ')}>
          <option value="call">call</option>
          <option value="put">put</option>
        </select>
      </div>
      <div className="field">
        <label>Position</label>
        <input type="number" step="10" value={params.pos} onChange={set('pos')} />
      </div>
      <div className="field wide">
        <label>Spot (manual)</label>
        <input
          type="range"
          min="1.5"
          max="2.8"
          step="0.001"
          value={params.S}
          onChange={(e) => onChange({ ...params, S: e.target.value })}
        />
      </div>
      <button className={`btn ${autoOn ? 'on' : ''}`} onClick={onToggleAuto}>
        Auto ticks
      </button>
      <button className="btn gold" onClick={onShock}>
        Shock −5%
      </button>
    </div>
  );
}
