import { Link, Navigate, useParams } from 'react-router-dom';
import { ACTORS, STAGES, vendorJourneyBySlug } from '../../lib/stages.js';
import { PageHead } from '../../components/common/PageHead.jsx';

/* A part of the vendor journey that is not built yet. Shows what the vendor will do there; no sample data. */
export default function VendorStagePage() {
  const { slug } = useParams();
  const j = vendorJourneyBySlug(slug);
  if (!j) return <Navigate to="/vendor" replace />;
  if (j.path) return <Navigate to={j.path} replace />;
  const stage = STAGES.find(s => s.n === j.stage);
  return (
    <>
      <PageHead eyebrow={`Vendor · Stage ${j.stage} · ${stage.title}`} title={j.title} lead={j.text} />
      <div className="card stage-later">
        <div className="adm-later-head">
          <span className="adm-stage">Not available yet</span>
          <span className="note">Built with Stage {j.stage}. Nothing here uses sample data.</span>
        </div>
        <ol className="steps-list">
          {stage.steps.map(([n, t, from, to]) => {
            const mine = from === 'V' || to === 'V';
            return (
              <li key={n} className={mine ? 'mine' : ''}>
                <span className="journey-n">{n}</span>
                <span>
                  {t}
                  {mine ? (
                    <span className="b b-plum" style={{ marginLeft: 8 }}>
                      You
                    </span>
                  ) : null}
                </span>
                <span className="note">{from === to ? ACTORS[from] : `${ACTORS[from]} → ${ACTORS[to]}`}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <Link className="link" to="/vendor">
        Back to dashboard
      </Link>
    </>
  );
}
