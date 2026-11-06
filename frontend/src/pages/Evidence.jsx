import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fmtTime } from '../lib/format.js';
import { PageHead } from '../components/common/PageHead.jsx';
import { Icon } from '../components/common/Icon.jsx';
import Loading from '../components/extras/Loading.jsx';

const STATUS_TONE = {
  Analysed: 'b-sage',
  Valid: 'b-sage',
  Submitted: 'b-sage',
  Received: 'b-mute',
  Uploaded: 'b-mute',
  Expiring: 'b-amber',
  'Not submitted': 'b-amber',
  Expired: 'b-coral',
};

/*
 * Evidence (sidebar, as in the client's demo): every document held for the
 * organisation's assessments, with tabs All / Contracts / Policies / Certificates /
 * Other. A row opens the stage the document belongs to.
 */
export default function Evidence() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('All');

  useEffect(() => {
    api('/assessments/evidence')
      .then(setData)
      .catch(err => setError(err.message));
  }, []);

  const documents = data ? data.documents : [];
  const shown = tab === 'All' ? documents : documents.filter(doc => doc.group === tab);
  const count = group => documents.filter(doc => doc.group === group).length;

  return (
    <>
      <PageHead
        eyebrow="Evidence"
        title="Evidence"
        lead="Every document held for your assessments: contracts, the vendors’ policies and certificates, and the evidence sent for actions."
      />

      <div className="ev-layout">
        <div className="card" data-section="evidence">
          {error ? <p className="form-err pad">{error}</p> : null}

          <div className="tk-bar">
            <div className="tk-tabs" role="tablist" aria-label="Kind of document">
              {['All', ...(data ? data.groups : [])].map(group => (
                <button
                  key={group}
                  type="button"
                  role="tab"
                  aria-selected={tab === group}
                  className={'tk-tab' + (tab === group ? ' on' : '')}
                  onClick={() => setTab(group)}
                  data-tab={group}
                >
                  {group}
                  <span className="tk-count">{group === 'All' ? documents.length : count(group)}</span>
                </button>
              ))}
            </div>
          </div>

          {!data ? (
            <Loading pad />
          ) : shown.length === 0 ? (
            <p className="note pad">
              {documents.length === 0
                ? 'No documents yet. Contracts, vendor evidence and action evidence appear here as they are uploaded.'
                : 'No documents of this kind yet.'}
            </p>
          ) : (
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Related to</th>
                    <th>Uploaded</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(doc => (
                    <tr
                      key={doc.id}
                      className="click"
                      onClick={() => navigate(doc.to)}
                      data-group={doc.group}
                    >
                      <td>
                        <span className="ev-doc">
                          <Icon n="doc" s={16} />
                          <span>
                            <b>{doc.name}</b>
                            <span className="note">
                              {[doc.vendor, doc.reference].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td>{doc.relatedTo}</td>
                      <td className="mono">{fmtTime(doc.uploadedAt)}</td>
                      <td>
                        <span className={'b ' + (STATUS_TONE[doc.status] || 'b-mute')}>{doc.status}</span>
                        {doc.expiresOn ? <div className="note">expires {doc.expiresOn}</div> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <aside className="card ev-reports" data-section="generate-report">
          <h2>Generate Report</h2>
          <p className="note">
            The evidence-backed report, the audit pack and the PDF are made for each assessment in Reports.
          </p>
          <ul>
            <li>
              <Icon n="report" s={16} /> Compliance Summary
            </li>
            <li>
              <Icon n="alert" s={16} /> Risk Report
            </li>
            <li>
              <Icon n="users" s={16} /> Supplier Assessment
            </li>
            <li>
              <Icon n="folder" s={16} /> Audit Pack
            </li>
          </ul>
          <Link className="btn primary" to="/monitoring" data-act="open-reports">
            Generate PDF
          </Link>
        </aside>
      </div>
    </>
  );
}
