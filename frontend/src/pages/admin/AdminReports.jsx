import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { fmtTime } from '../../lib/format.js';
import { POSITION_TONE, shortHash } from '../../lib/reports.js';
import { PageHead } from '../../components/common/PageHead.jsx';
import Loading from '../../components/extras/Loading.jsx';

/* Admin · Reports: every Stage 9 report issued on the platform, newest first. */
export default function AdminReports() {
  const [reports, setReports] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/admin/reports').then(r => setReports(r.reports)).catch(err => setError(err.message)); }, []);

  return (
    <>
      <PageHead eyebrow="Admin console · Outputs" title="Reports"
        lead="Every assessment report saved by buyers (Stage 9), with its stated position and fingerprint. Reports cannot be changed; a new version is saved instead." />
      <div className="card" data-section="admin-reports">
        {error ? <p className="form-err pad">{error}</p> : null}
        {!reports ? <Loading pad /> : reports.length === 0 ? (
          <p className="note pad">No reports yet. They appear here when a buyer generates one in Stage 9.</p>
        ) : (
          <div className="tw"><table>
            <thead><tr><th>Assessment</th><th>Buyer</th><th>Vendor</th><th>Version</th><th>Position</th><th>Saved</th><th>SHA-256</th></tr></thead>
            <tbody>{reports.map(r => (
              <tr key={r.reference + r.version}>
                <td><Link className="adm-ulink" to={'/admin/assessments/' + r.reference}><b className="mono">{r.reference}</b></Link><div className="note">{r.title}</div></td>
                <td>{r.buyerName}</td>
                <td>{r.vendorName || '—'}</td>
                <td>v{r.version}.0<div className="note">{r.reason}</div></td>
                <td><span className={'b ' + POSITION_TONE[r.position.code]}>{r.position.label}</span></td>
                <td>{fmtTime(r.createdAt)}<div className="note">{r.createdBy}</div></td>
                <td className="mono note" title={r.snapshotSha256}>{shortHash(r.snapshotSha256)}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
