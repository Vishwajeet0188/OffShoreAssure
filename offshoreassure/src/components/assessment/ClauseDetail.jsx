import { Fragment } from 'react';
import { isPass } from '../../engine/engines.js';
import { useAssessment } from '../../hooks/useAssessment.js';
import { Badge } from '../common/Badges.jsx';

/* Finding label for a clause in the extracted-clauses table. */
export function clauseFinding(c, D) {
  if (!c.relevant) return null;
  const ch = D.checks.find(x => x.clauses.some(y => y.id === c.id) && x.rule.type !== 'jurisdiction') || D.checks.find(x => x.clauses.some(y => y.id === c.id));
  if (!ch) return 'Identified';
  if (ch.rule.type === 'jurisdiction') return D.juris.status === 'adequate' ? 'Satisfied' : 'Review';
  const st = D.reqStatus[ch.req];
  return st === 'Satisfied' ? 'Satisfied' : isPass(ch.status) && st !== 'Review required' && st !== 'Partially satisfied' ? 'Identified' : 'Review';
}

const MARKS = [/within \d+ (hours?|days|business days)/i, /prior written approval|general written authorisation/i, /CloudOps Polska Sp\. z o\.o\./, /in (Bangalore, )?India|in Poland/i, /\d+(\.\d+)?% (of calls within \d+ seconds|availability)/i];
/* Highlights the extracted terms (deadline, approval model, third party, location, service level) in the clause text. */
export function Highlighted({ text }) {
  let segs = [{ t: text, m: false }];
  MARKS.forEach(re => {
    for (let i = 0; i < segs.length; i++) {
      if (segs[i].m) continue;
      const hit = segs[i].t.match(re);
      if (hit) { const s = segs[i].t; const at = hit.index; segs.splice(i, 1, { t: s.slice(0, at), m: false }, { t: hit[0], m: true }, { t: s.slice(at + hit[0].length), m: false }); break; }
    }
  });
  segs = segs.filter(s => s.t);
  return <>{segs.map((s, i) => s.m ? <mark key={i}>{s.t}</mark> : <Fragment key={i}>{s.t}</Fragment>)}</>;
}

export default function ClauseDetail({ c }) {
  const { a, act } = useAssessment();
  if (!c) return null;
  const o = c.obligation; const held = c.confidence && c.confidence < 0.75;
  return (
    <div className="card pad stack">
      <div className="spread">
        <div><div className="eyebrow">Clause {c.id} · {c.section || ''}</div><h2 className="serif" style={{ fontSize: 21 }}>{c.heading}</h2></div>
        {a.accepted[c.id] ? <Badge s="Accepted" label="Extraction accepted" /> : held ? <Badge s="Held for review" /> : null}
      </div>
      <div className="quote"><Highlighted text={c.text} /></div>
      {!c.relevant ? <p className="note">Classified as {c.label}. No compliance rule applies.</p> : <>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>OffshoreAssure interpretation</div>
          <dl className="kv">
            <dt>Category</dt><dd>{c.label}</dd>
            {o ? <><dt>Obligation</dt><dd>{o.text}</dd><dt>Responsible party</dt><dd>{o.partyName}</dd><dt>Event</dt><dd>{o.event}</dd><dt>Deadline</dt><dd>{o.deadline}</dd></> : null}
            {c.entities.map((e, i) => <Fragment key={i}><dt>Entity type</dt><dd>{e.role}</dd><dt>Name</dt><dd>{e.name}</dd><dt>Location</dt><dd>{[e.city, e.country].filter(Boolean).join(', ')}</dd><dt>Processing activity</dt><dd>{e.activity || '—'}</dd></Fragment>)}
            {c.countries.length ? <><dt>Jurisdictions</dt><dd>{c.countries.join(', ')}</dd></> : null}
            <dt>Extraction confidence</dt><dd><span className="mono">{Math.round(c.confidence * 100)}%</span> <span className="note">signals: {c.signals.join(', ')}</span></dd>
          </dl>
        </div>
        {held && !a.accepted[c.id] ? <p className="note">Below the 75% escalation threshold. Held for human review before it can feed the rule engine.</p> : null}
        <div className="row">
          {a.accepted[c.id] ? <span className="note">Accepted by {a.accepted[c.id]}</span> : <button className="btn sm primary" data-act="accept" data-id={c.id} onClick={() => act.accept(c.id)}>Accept extraction</button>}
          <button className="btn sm" data-act="mapClause" data-id={c.id} onClick={() => act.mapClause(c.id)}>View rule mapping</button>
        </div>
      </>}
    </div>
  );
}
