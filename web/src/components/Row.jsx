import React from 'react';

// One key/value line in a panel table -- mirrors the row() template-literal
// helper the original HTML dashboards used, just as a component.
export default function Row({ label, value, cls = '', unit = '' }) {
  return (
    <div className="row">
      <span className="k">
        {label}
        {unit && <small>{unit}</small>}
      </span>
      <span className={`v ${cls}`}>{value}</span>
    </div>
  );
}

export function SubHeading({ children }) {
  return <div className="sub">{children}</div>;
}
