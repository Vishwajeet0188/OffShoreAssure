import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { fmtTime } from '../../lib/format.js';
import { fmtBytes } from '../../lib/requirements.js';
import {
  EVENT_WORD,
  STATUS_TONE,
  actionFileUrl,
  isOverdue,
  uploadActionFile,
} from '../../lib/remediation.js';
import { PageHead } from '../../components/common/PageHead.jsx';
import { Icon } from '../../components/common/Icon.jsx';
import Loading from '../../components/extras/Loading.jsx';
import { confirmAction } from '../../components/extras/ConfirmDialog.jsx';

const VENDOR_STATUS = {
  OPEN: 'To do',
  RETURNED: 'More needed',
  SUBMITTED: 'Sent for review',
  CLOSED: 'Closed',
};

/* Vendor portal · Actions: buyers that asked this company for corrections or documents (Stage 8, steps 34–35). */
export function VendorActionsList() {
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/vendor/actions')
      .then(r => setList(r.assessments))
      .catch(err => setError(err.message));
  }, []);

  return (
    <>
      <PageHead
        eyebrow="Vendor · Actions"
        title="Actions"
        lead="Corrections and documents your buyers have asked for. Send the proof for each action; the buyer checks it and closes it."
      />
      <div className="card" data-section="vendor-actions-list">
        {error ? <p className="form-err pad">{error}</p> : null}
        {!list ? (
          <Loading pad />
        ) : list.length === 0 ? (
          <p className="note pad">
            No actions yet. They appear here when a buyer that selected your company asks for corrections or
            documents.
          </p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Assessment</th>
                  <th>Buyer</th>
                  <th>To do</th>
                  <th>Next due</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map(a => (
                  <tr
                    key={a.reference}
                    className="click"
                    onClick={() => navigate('/vendor/actions/' + a.reference)}
                  >
                    <td>
                      <b className="mono">{a.reference}</b>
                      <div className="note">{a.title}</div>
                    </td>
                    <td>{a.buyerName}</td>
                    <td>
                      {a.toDo ? (
                        <span className="b b-amber">{a.toDo} to do</span>
                      ) : (
                        <span className="b b-sage">Nothing to do</span>
                      )}
                      <div className="note">
                        {a.submitted} sent · {a.closed} closed
                      </div>
                    </td>
                    <td className="mono">{a.nextDue || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        className="btn sm primary"
                        to={'/vendor/actions/' + a.reference}
                        onClick={e => e.stopPropagation()}
                        data-act="open-vendor-actions"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* One assessment: each action with what is needed, the documents and the response. */
export default function VendorActions() {
  const { ref } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(
    () =>
      api('/vendor/actions/' + ref)
        .then(setData)
        .catch(err => setError(err.message)),
    [ref],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function act(key, fn, okText) {
    setBusy(key);
    setMsg(null);
    try {
      const r = await fn();
      if (r?.actions) setData(d => ({ ...d, actions: r.actions }));
      if (okText) setMsg({ tone: 'ok', text: okText });
    } catch (err) {
      setMsg({ tone: 'err', text: err.message });
    } finally {
      setBusy('');
    }
  }

  if (error && !data) return <p className="form-err">{error}</p>;
  if (!data) return <Loading />;
  const toDo = data.actions.filter(a => ['OPEN', 'RETURNED'].includes(a.status)).length;

  return (
    <div className="vs">
      <Link
        className="link"
        to="/vendor/actions"
        style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
      >
        ← Actions
      </Link>
      <PageHead
        eyebrow={`Vendor · Actions · ${data.reference}`}
        title={data.title}
        lead={`${data.buyerName} has asked for ${data.actions.length} action${data.actions.length === 1 ? '' : 's'}; ${toDo} still to do.`}
      />
      {msg ? (
        <div className={'rq-msg ' + msg.tone} role="status">
          <b>{msg.text}</b>
        </div>
      ) : null}
      {data.actions.map(a => (
        <VendorAction key={a.number} reference={ref} a={a} busy={busy} act={act} fileRules={data.fileRules} />
      ))}
    </div>
  );
}

function VendorAction({ reference, a, busy, act, fileRules }) {
  const base = `/vendor/actions/${reference}/${a.number}`;
  const [response, setResponse] = useState(a.status === 'RETURNED' ? '' : a.response || '');
  const editable = ['OPEN', 'RETURNED'].includes(a.status);
  const overdue = isOverdue(a);

  async function upload(file) {
    if (!file) return;
    await act('up' + a.number, () => uploadActionFile(base, file), `${file.name} added to ${a.code}.`);
  }
  async function remove(e) {
    if (
      !(await confirmAction({
        title: `Remove ${e.fileName}?`,
        message: 'You can upload it again before you send the response.',
        confirmLabel: 'Remove',
      }))
    )
      return;
    await act(
      'rm' + e.id,
      () => api(`${base}/evidence/${e.id}`, { method: 'DELETE' }),
      `${e.fileName} removed.`,
    );
  }

  return (
    <section className="card" data-section="vendor-action" data-action={a.code} data-status={a.status}>
      <div className="ch">
        <div>
          <h2>
            <span className="rid">{a.code}</span> {a.title}
          </h2>
          <div className="sub">
            {a.dueOn ? `Due ${a.dueOn}` : ''}
            {overdue ? ' · overdue' : ''}
          </div>
        </div>
        <span className={'b ' + (overdue ? 'b-coral' : STATUS_TONE[a.status])}>
          {overdue ? 'Overdue' : VENDOR_STATUS[a.status] || a.statusLabel}
        </span>
      </div>
      <div className="pad stack">
        <div>
          <b>What is needed</b>
          <ul className="rm-requests">
            {a.requests.map(r => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {a.needsDocument ? (
            <span className="note">
              Upload at least one document as proof ({fileRules.extensions.join(', ')}; up to{' '}
              {Math.round(fileRules.maxBytes / 1048576)} MB).
            </span>
          ) : null}
        </div>
        {a.buyerNote ? (
          <p className="rm-quote">
            <b>{a.status === 'RETURNED' ? 'What the buyer still needs' : 'Note from the buyer'}:</b>{' '}
            {a.buyerNote}
          </p>
        ) : null}

        <div>
          <b>Documents</b>
          {a.evidence.length ? (
            <ul className="rm-files">
              {a.evidence.map(e => (
                <li key={e.id}>
                  <a className="link" href={actionFileUrl(base, e.id)}>
                    {e.fileName}
                  </a>{' '}
                  <span className="note">
                    {fmtBytes(e.size)}
                    {e.submitted ? ' · sent' : ''}
                  </span>
                  {editable && !e.submitted ? (
                    <button className="btn sm" onClick={() => remove(e)} disabled={busy === 'rm' + e.id}>
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="note" style={{ margin: '4px 0' }}>
              None yet.
            </p>
          )}
          {editable ? (
            <label className="btn sm rm-file" data-act="add-document">
              {busy === 'up' + a.number ? 'Uploading…' : 'Add a document'}
              <input
                type="file"
                hidden
                onChange={e => {
                  upload(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
          ) : null}
        </div>

        {editable ? (
          <div className="field">
            <label htmlFor={'va-' + a.number}>Your response</label>
            <textarea
              id={'va-' + a.number}
              rows={3}
              maxLength={3000}
              value={response}
              onChange={e => setResponse(e.target.value)}
              placeholder="What you changed or what the documents show (at least 10 characters)"
            />
            <div style={{ marginTop: 8 }}>
              <button
                className="btn primary"
                disabled={busy === 'send' + a.number}
                data-act="send-response"
                onClick={() =>
                  act(
                    'send' + a.number,
                    () => api(`${base}/submit`, { method: 'POST', body: { response } }),
                    `${a.code} sent to the buyer for review.`,
                  )
                }
              >
                {busy === 'send' + a.number ? 'Sending…' : 'Send for review'}
              </button>
            </div>
          </div>
        ) : a.response ? (
          <p className="rm-quote">
            <b>Your response:</b> {a.response}
          </p>
        ) : null}

        <details className="vs-details">
          <summary>History ({a.history.length})</summary>
          <ul className="rm-history">
            {a.history.map((h, i) => (
              <li key={i}>
                <span className="mono note">{fmtTime(h.at)}</span> <b>{EVENT_WORD[h.event] || h.event}</b>
                {h.role === 'buyer' ? <span className="note"> · buyer</span> : null}
              </li>
            ))}
          </ul>
        </details>
      </div>
      {a.status === 'CLOSED' ? (
        <p className="ir-foot note">
          <Icon n="check" s={14} /> The buyer has checked and closed this action.
        </p>
      ) : null}
    </section>
  );
}
