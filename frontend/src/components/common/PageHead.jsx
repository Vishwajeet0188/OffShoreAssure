/* Page heading used across the app and the admin console. */
export function PageHead({ eyebrow, title, lead, right }) {
  return (
    <div className="ph">
      <div>
        {eyebrow ? <div className="eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</div> : null}
        <h1>{title}</h1>
        {lead ? <p className="lead">{lead}</p> : null}
      </div>
      {right ? <div className="row">{right}</div> : null}
    </div>
  );
}
