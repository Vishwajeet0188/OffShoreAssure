import { VENDORS } from '../../data/prototype-data.js';
import { STAGES, stageDone, initials, statusWord } from '../../lib/constants.js';
import { outputOf } from '../../lib/portfolio.js';
import { useAssessment } from '../../hooks/useAssessment.js';
import { Icon } from '../common/Icon.jsx';
import { Badge } from '../common/Badges.jsx';
import { PageHead } from '../common/Blocks.jsx';

/* Assessment header plus the 12-step assurance path. */
export function AssessmentFrame({ children }) {
  const { a, D, route, act } = useAssessment();
  const v = VENDORS[a.vendorId];
  return (
    <>
      <div className="ah">
        <div className="who">
          <span className="sup">{initials(v.name)}</span>
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">Assessment · {a.id}</div>
            <div style={{ font: '600 18px/1.3 var(--f-serif)' }}>{a.name || 'Untitled assessment'}</div>
            <div className="note">{a.org || '—'} → {v.name} · {v.location + ', ' + v.country}</div>
          </div>
        </div>
        <div className="meta">
          {D.analysis ? <Badge s={statusWord(D.overall)} /> : null}
          {D.assurance != null ? <div className="score"><div className="eyebrow">Assurance score</div><b>{D.assurance}</b><span className="note"> / 100</span></div> : null}
          <span className="proto">Prototype output</span>
        </div>
      </div>
      <nav className="card path" aria-label="Assurance path">
        {STAGES.map(s => {
          const ok = s.ok(a), done = stageDone(a, s.id), cur = route.view === s.id;
          return (
            <button key={s.id} className={'pstep' + (done ? ' done' : '') + (cur ? ' cur' : '')} data-act="go" data-v={s.id} disabled={!ok} onClick={() => act.go(s.id)}>
              <span className="c"><Icon n={s.icon} s={19} /></span><span className="l">{s.label}</span><span className="o">{outputOf(a, D, s.id)}</span>
            </button>
          );
        })}
      </nav>
      {children}
    </>
  );
}

/* Shown when a stage is opened before the stage it depends on has run, or with no assessment open. */
export function EmptyStage({ stage }) {
  const { a, act } = useAssessment();
  const reach = a ? (STAGES.slice().reverse().find(x => x.ok(a)) || STAGES[0]) : null;
  return (
    <>
      <PageHead title={stage.label} />
      <div className="card empty">
        <span className="ic"><Icon n={stage.icon} s={24} /></span>
        <h2 className="serif" style={{ fontSize: 22 }}>{a ? 'This stage opens once the earlier stages have run' : 'No assessment open'}</h2>
        <p className="note" style={{ maxWidth: '52ch' }}>{a ? 'Every stage uses the stored output of the stage before it. Continue from "' + reach.label + '".' : 'Start one of the two demonstration scenarios. Each stage then reads the output of the stage before it.'}</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          {a
            ? <button className="btn primary" data-act="go" data-v={reach.id} onClick={() => act.go(reach.id)}>Continue at {reach.label}</button>
            : <><button className="btn primary" data-act="new" data-preset="uc1" onClick={() => act.create('uc1')}>Start Use Case 1</button><button className="btn dark" data-act="new" data-preset="uc2" onClick={() => act.create('uc2')}>Start Use Case 2</button></>}
        </div>
      </div>
    </>
  );
}
