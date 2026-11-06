import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { fmtTime } from '../../lib/format.js';
import { POSITION_TONE, adminPdfUrl, shortHash } from '../../lib/reports.js';
import { PageHead } from '../../components/common/PageHead.jsx';
import Loading from '../../components/extras/Loading.jsx';

/* Admin · Reports: every Stage 9 report issued on the platform, newest first. */
export default function AdminReports() {
  const [reports, setReports] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api('/admin/reports')
      .then(r => setReports(r.reports))
      .catch(err => setError(err.message));
  }, []);

  return (
    <>
      <PageHead
        eyebrow="Admin console · Outputs"
        title="Reports"
        lead="Every assessment report saved by buyers (Stage 9), with its stated position and fingerprint. Reports cannot be changed; a new version is saved instead."
      />
      <div className="card" data-section="admin-reports">
        {error ? <p className="form-err pad">{error}</p> : null}
        {!reports ? (
          <Loading pad />
        ) : reports.length === 0 ? (
          <p className="note pad">No reports yet. They appear here when a buyer generates one in Stage 9.</p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Assessment</th>
                  <th>Buyer</th>
                  <th>Vendor</th>
                  <th>Version</th>
                  <th>Position</th>
                  <th>Saved</th>
                  <th>SHA-256</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.reference + r.version}>
                    <td>
                      <Link className="adm-ulink" to={'/admin/assessments/' + r.reference}>
                        <b className="mono">{r.reference}</b>
                      </Link>
                      <div className="note">{r.title}</div>
                    </td>
                    <td>{r.buyerName}</td>
                    <td>{r.vendorName || '—'}</td>
                    <td>
                      v{r.version}.0<div className="note">{r.reason}</div>
                    </td>
                    <td>
                      <span className={'b ' + POSITION_TONE[r.position.code]}>{r.position.label}</span>
                    </td>
                    <td>
                      {fmtTime(r.createdAt)}
                      <div className="note">{r.createdBy}</div>
                    </td>
                    <td className="mono note" title={r.snapshotSha256}>
                      {shortHash(r.snapshotSha256)}
                    </td>
                    <td>
                      <a className="btn sm" href={adminPdfUrl(r.reference, r.version)} data-act="admin-pdf">
                        PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ChecksCard />
    </>
  );
}

/* The automatic daily checks: when they last ran, what they changed, and a button to run them now. */
function ChecksCard() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = () =>
    api('/admin/checks')
      .then(setData)
      .catch(err => setMsg({ tone: 'err', text: err.message }));
  useEffect(() => {
    load();
  }, []);

  async function runNow() {
    setBusy(true);
    setMsg(null);
    try {
      const { summary } = await api('/admin/checks/run', { method: 'POST' });
      setMsg({
        tone: 'ok',
        text: `Checked ${summary.assessments} assessment${summary.assessments === 1 ? '' : 's'}: ${summary.changed.length} changed.`,
      });
      await load();
    } catch (err) {
      setMsg({ tone: 'err', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" data-section="admin-checks" style={{ marginTop: 14 }}>
      <div className="ch">
        <div>
          <h2>Automatic checks</h2>
          <div className="sub">
            {data
              ? `${data.rules.schedule}: re-score expired certificates and insurance, rebuild the risk register, and ask for renewals ${data.rules.renewalDays} days before expiry.`
              : ''}
          </div>
        </div>
        <button className="btn sm primary" disabled={busy} onClick={runNow} data-act="run-checks">
          {busy ? 'Running…' : 'Run checks now'}
        </button>
      </div>
      {msg ? (
        <div className={'rq-msg ' + msg.tone} role="status" style={{ margin: '0 22px 12px' }}>
          <b>{msg.text}</b>
        </div>
      ) : null}
      {!data ? (
        <Loading pad />
      ) : data.runs.length === 0 ? (
        <p className="note pad">The checks have not run yet.</p>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Started</th>
                <th>How</th>
                <th>Assessments</th>
                <th>What changed</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map(r => (
                <tr key={r.id}>
                  <td>{fmtTime(r.startedAt)}</td>
                  <td>{r.trigger === 'admin' ? 'Run by an admin' : 'Daily schedule'}</td>
                  <td>{r.summary.assessments ?? '—'}</td>
                  <td>
                    {!r.finishedAt ? (
                      'Running…'
                    ) : r.summary.changed?.length ? (
                      r.summary.changed.map(c => (
                        <div key={c.reference}>
                          <b className="mono">{c.reference}</b>{' '}
                          {c.error
                            ? `failed: ${c.error}`
                            : c.changes
                                .map(x =>
                                  x.kind === 'rescored'
                                    ? `score ${x.from} → ${x.to}`
                                    : x.kind === 'register'
                                      ? `risk register v${x.version}`
                                      : `${x.actions.length} renewal request${x.actions.length === 1 ? '' : 's'}`,
                                )
                                .join(' · ')}
                        </div>
                      ))
                    ) : (
                      <span className="muted">Nothing changed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
