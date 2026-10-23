import { Link, Navigate, useParams } from 'react-router-dom';
import { ACTORS, BUILT_STEPS, stageBySlug } from '../lib/stages.js';
import { PageHead } from '../components/common/PageHead.jsx';

/* A stage whose steps are not built yet: shows what it will do (from the sequence diagram). No sample data. */
export default function StagePage() {
  const { slug } = useParams();
  const s = stageBySlug(slug);
  if (!s) return <Navigate to="/dashboard" replace />;
  if (s.path) return <Navigate to={s.path} replace />;
  return (
    <>
      <PageHead eyebrow={`Buyer · Stage ${s.n}`} title={s.title} lead={s.summary} />
      <div className="card stage-later">
        <div className="adm-later-head"><span className="adm-stage">Not available yet</span><span className="note">This stage is built after the earlier stages. Nothing here uses sample data.</span></div>
        <ol className="steps-list">
          {s.steps.map(([n, t, from, to]) => (
            <li key={n} className={BUILT_STEPS.includes(n) ? 'on' : ''}>
              <span className="journey-n">{n}</span><span>{t}</span>
              <span className="note">{from === to ? ACTORS[from] : `${ACTORS[from]} → ${ACTORS[to]}`}</span>
            </li>))}
        </ol>
      </div>
      <Link className="link" to="/dashboard">Back to dashboard</Link>
    </>
  );
}
