import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtTime } from '../lib/format.js';
import { STAGES, BUILT_STEPS } from '../lib/stages.js';
import { TIER_LABEL, TIER_TONE } from '../lib/assessments.js';
import { PageHead } from '../components/common/PageHead.jsx';
import { Badge } from '../components/common/Badges.jsx';
import Loading from '../components/extras/Loading.jsx';

/* Stage 1 · Requirement: the buyer's outsourcing requirements (live, from the API). */
export default function Requirements() {
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api('/requirements')
      .then(r => setList(r.requirements))
      .catch(x => setErr(x.message));
  }, []);
  const stage = STAGES[0];
  return (
    <>
      <PageHead
        eyebrow="Buyer · Stage 1 · Requirement"
        title="Outsourcing requirements"
        lead="Describe each service you plan to outsource. Drafts are saved to your account; submit when every required answer is complete."
        right={
          <Link className="btn primary" to="/requirements/new" data-act="new-requirement">
            + New requirement
          </Link>
        }
      />
      <div className="card" data-section="my-requirements">
        {err ? (
          <p className="form-err" style={{ padding: '0 22px' }}>
            {err}
          </p>
        ) : null}
        {!list ? (
          <Loading pad />
        ) : list.length === 0 ? (
          <p className="note pad">
            No requirements yet. Choose <b>New requirement</b> to start; you can save a draft and finish it
            later.
          </p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Requirement</th>
                  <th>Assessment ID</th>
                  <th>Status</th>
                  <th>Risk tier</th>
                  <th>Last updated</th>
                </tr>
              </thead>
              <tbody>
                {list.map(r => (
                  <tr key={r.id} className="click" onClick={() => navigate('/requirements/' + r.id)}>
                    <td>
                      <Link
                        className="adm-ulink"
                        to={'/requirements/' + r.id}
                        onClick={e => e.stopPropagation()}
                      >
                        <b>{r.title || 'Untitled requirement'}</b>
                      </Link>
                    </td>
                    <td className="mono">{r.assessment?.reference || <span className="muted">—</span>}</td>
                    <td>
                      {r.status === 'submitted' ? (
                        <Badge s="Submitted" />
                      ) : (
                        <>
                          <Badge s="Draft" />
                          <div className="note">
                            {r.missingCount
                              ? `${r.missingCount} required answer${r.missingCount === 1 ? '' : 's'} to complete`
                              : 'Ready to submit'}
                          </div>
                        </>
                      )}
                    </td>
                    <td>
                      {r.assessment ? (
                        <span className={'b b-' + TIER_TONE[r.assessment.riskTier]}>
                          {TIER_LABEL[r.assessment.riskTier]}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="mono">
                      {fmtTime(r.status === 'submitted' ? r.submittedAt : r.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="card">
        <div className="ch">
          <div>
            <h2>Stage 1 steps</h2>
            <div className="sub">From the sequence diagram</div>
          </div>
        </div>
        <ol className="steps-list">
          {stage.steps.map(([n, t]) => (
            <li key={n} className={BUILT_STEPS.includes(n) ? 'on' : ''}>
              <span className="journey-n">{n}</span>
              <span>{t}</span>
              <span className="note">{BUILT_STEPS.includes(n) ? 'Available' : 'Not available yet'}</span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
