import React from 'react';
import Row, { SubHeading } from './Row.jsx';
import { fmt, sgn } from '../lib/format.js';

// Rows are (per-option Greek) x (position size) EXCEPT lambda, which is a
// dimensionless elasticity and stays per-option -- see lib/quant.js's own
// comments for why. Label suffix makes the scaling explicit (this was the
// exact ambiguity that made delta=55.99 look like a bug before the port).
export default function GreeksPanel({ g, position, price }) {
  const qty = `(${position} qty)`;
  const rows = [
    ['first order', [
      [`Δ delta ${qty}`, g.delta * position],
      [`Γ gamma ${qty}`, g.gamma * position],
      [`ν vega ${qty}`, g.vega * position, '1%'],
      [`Θ theta ${qty}`, g.theta * position, '/day'],
      [`ρ rho ${qty}`, g.rho * position, '1%'],
      [`ε epsilon ${qty}`, g.epsilon * position],
      ['Λ lambda (elast., per-option)', g.lambda],
    ]],
    ['second order', [
      [`vanna ${qty}`, g.vanna * position],
      [`charm ${qty}`, g.charm * position, '/day'],
      [`vomma ${qty}`, g.vomma * position],
      [`veta ${qty}`, g.veta * position],
      [`vera ${qty}`, g.vera * position],
    ]],
    ['third order & duals', [
      [`speed ${qty}`, g.speed * position],
      [`zomma ${qty}`, g.zomma * position],
      [`color ${qty}`, g.color * position, '/day'],
      [`ultima ${qty}`, g.ultima * position],
      [`dual delta ${qty}`, g.dualDelta * position],
      [`dual gamma ${qty}`, g.dualGamma * position],
    ]],
  ];
  const total = rows.reduce((n, [, r]) => n + r.length, 0) + 1; // +1 for option value

  return (
    <section className="panel">
      <p className="panel-title">
        Greeks <span className="count">{total} live</span>
      </p>
      {rows.map(([heading, items]) => (
        <React.Fragment key={heading}>
          <SubHeading>{heading}</SubHeading>
          {items.map(([label, value, unit]) => (
            <Row key={label} label={label} value={fmt(value, 4)} cls={sgn(value)} unit={unit} />
          ))}
        </React.Fragment>
      ))}
      <Row label="option value" value={fmt(price * position, 2)} cls="gold" />
    </section>
  );
}
