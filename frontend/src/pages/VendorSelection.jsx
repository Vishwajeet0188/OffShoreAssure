import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { TIER_LABEL, TIER_TONE, serviceLabel } from '../lib/assessments.js';
import { MODES, SELECTION_STATUS, countryList } from '../lib/selection.js';
import { useAuth } from '../context/AuthContext.jsx';
import { PageHead } from '../components/common/PageHead.jsx';
import { Badge } from '../components/common/Badges.jsx';
import { Icon } from '../components/common/Icon.jsx';
import Loading from '../components/extras/Loading.jsx';
import { ReferenceTag } from '../components/extras/CopyButton.jsx';
import DirectorySearch from '../components/selection/DirectorySearch.jsx';
import ExistingVendor from '../components/selection/ExistingVendor.jsx';
import OwnVendorForm from '../components/selection/OwnVendorForm.jsx';
import { DirectoryComparison, SingleVendorSummary } from '../components/selection/Candidates.jsx';
import ConfirmSelection from '../components/selection/ConfirmSelection.jsx';
import SelectionRecord from '../components/selection/SelectionRecord.jsx';

const BackArrow = ({ s = 14 }) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

/* Stage 2 landing: the organisation's assessments and where each one is in vendor selection. */
export function VendorSelectionList() {
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api('/assessments')
      .then(r => setList(r.assessments))
      .catch(x => setErr(x.message));
  }, []);
  return (
    <>
      <PageHead
        eyebrow="Buyer · Stage 2 · Vendor selection"
        title="Vendor selection"
        lead="Choose the vendor for each assessment: search the OffshoreAssure directory, reuse a vendor you added before, or add your own. Then confirm your choice with the reason."
      />
      <div className="card" data-section="selection-list">
        {err ? (
          <p className="form-err" style={{ padding: '0 22px' }}>
            {err}
          </p>
        ) : null}
        {!list ? (
          <Loading pad />
        ) : !list.length ? (
          <p className="note pad">
            No assessments yet. Submit a requirement first (
            <Link className="link" to="/requirements">
              Stage 1 · Requirement
            </Link>
            ); its Assessment ID then appears here.
          </p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Assessment</th>
                  <th>Service</th>
                  <th>Risk tier</th>
                  <th>Vendor</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map(a => (
                  <tr
                    key={a.reference}
                    className="click"
                    onClick={() => navigate('/vendor-selection/' + a.reference)}
                  >
                    <td>
                      <Link
                        className="adm-ulink"
                        to={'/vendor-selection/' + a.reference}
                        onClick={e => e.stopPropagation()}
                      >
                        <b className="mono">{a.reference}</b>
                      </Link>
                      <div className="note">{a.title}</div>
                    </td>
                    <td>{serviceLabel(a.serviceCode)}</td>
                    <td>
                      <span className={'b b-' + TIER_TONE[a.riskTier]}>{TIER_LABEL[a.riskTier]}</span>
                    </td>
                    <td>
                      {a.selectedVendor ? (
                        <>
                          <Badge
                            s={
                              (SELECTION_STATUS[a.selectionStatus] ||
                                SELECTION_STATUS.SELECTED_PENDING_ASSESSMENT)[0]
                            }
                            label={(SELECTION_STATUS[a.selectionStatus] || ['', 'Selected'])[1]}
                          />{' '}
                          <b style={{ marginLeft: 6 }}>{a.selectedVendor}</b>
                          {a.selectionVersion > 1 ? (
                            <span className="note"> · v{a.selectionVersion}</span>
                          ) : null}
                        </>
                      ) : a.shortlisted ? (
                        <Badge
                          s="In progress"
                          label={`${a.shortlisted} candidate${a.shortlisted === 1 ? '' : 's'}`}
                        />
                      ) : (
                        <span className="muted">Not started</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="link">
                        {a.selectedVendor ? 'View' : 'Select vendor'} <Icon n="arrow" s={13} />
                      </span>
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

/* Stage 2 for one assessment (client spec v2). Step 5 offers three ways to provide a vendor; the routes meet at step 8. */
export default function VendorSelection() {
  const { ref } = useParams();
  const { user } = useAuth();
  const [st, setSt] = useState(null);
  const [def, setDef] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');
  const [mode, setMode] = useState('DIRECTORY_SEARCH');
  const [changing, setChanging] = useState(false);
  const confirmRef = useRef(null);

  const names = useMemo(() => Object.fromEntries((def?.countries || []).map(c => [c.code, c.name])), [def]);
  const load = useCallback(
    () =>
      api(`/assessments/${ref}/selection`)
        .then(setSt)
        .catch(x => setErr(x.message)),
    [ref],
  );
  useEffect(() => {
    load();
    api(`/assessments/${ref}/selection/form`)
      .then(setDef)
      .catch(x => setErr(x.message));
  }, [ref, load]);

  // Every route hands back the new state and a sentence for the person.
  const changed = (state, text) => {
    setSt(state);
    setMsg({ tone: 'ok', text });
  };
  const remove = async v => {
    setBusy('rm' + v.id);
    setMsg(null);
    try {
      changed(
        await api(`/assessments/${ref}/shortlist/${v.id}`, { method: 'DELETE' }),
        `${v.name} removed from the candidates.`,
      );
    } catch (x) {
      setMsg({ tone: 'err', text: x.message });
    } finally {
      setBusy('');
    }
  };

  if (err && (!st || !def)) return <p className="form-err">{err}</p>;
  if (!st || !def) return <Loading />;
  const c = st.criteria,
    cur = st.current;
  const directory = st.candidates.filter(v => v.candidateSource === 'DIRECTORY');
  const single = st.candidates.filter(v => v.candidateSource !== 'DIRECTORY');
  const showSteps5to8 = !cur || changing;
  const done = n => (n <= 7 ? st.candidates.length > 0 || !!cur : !!cur);
  return (
    <div className="vs">
      <Link
        className="link"
        to="/vendor-selection"
        style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
      >
        <BackArrow /> Vendor selection
      </Link>
      <PageHead
        eyebrow={`Buyer · Stage 2 · Vendor selection · ${st.assessment.reference}`}
        title={st.assessment.title}
        lead="Search the directory, reuse a vendor you added before, or add your own vendor. Each vendor is checked against your requirement before you confirm."
        right={<ReferenceTag value={st.assessment.reference} />}
      />
      <ol className="vs-steps" aria-label="Stage 2 steps">
        {[
          [5, 'Search, select or add'],
          [6, 'Match'],
          [7, 'Compare'],
          [8, 'Confirm vendor'],
          [9, 'Saved to evidence'],
        ].map(([n, t]) => (
          <li key={n} className={done(n) ? 'done' : ''}>
            <span className="journey-n">{n}</span>
            {t}
          </li>
        ))}
      </ol>
      {msg ? (
        <div className={'rq-msg ' + msg.tone} role="status">
          <b>{msg.text}</b>
        </div>
      ) : null}
      {st.blocked ? (
        <div className="rq-flag warning">
          <Icon n="alert" s={16} />
          <span>
            {st.blocked}{' '}
            <Link className="link" to="/requirements">
              Open requirements
            </Link>
          </span>
        </div>
      ) : null}

      {cur ? (
        <SelectionRecord
          st={st}
          changing={changing}
          onChange={() => {
            setChanging(true);
            setTimeout(() => confirmRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
          }}
        />
      ) : null}

      <section className="card vs-criteria" data-section="criteria">
        <div className="ch">
          <div>
            <h2>What vendors are checked against</h2>
            <div className="sub">
              From your requirement (profile v{st.assessment.requirementVersion}). Step 6 checks every vendor
              against these, whichever way it was added.
            </div>
          </div>
        </div>
        <dl className="kv pad">
          <dt>Service</dt>
          <dd>
            {c.serviceCategory} · {c.serviceCriticality} criticality
          </dd>
          <dt>Preferred countries</dt>
          <dd>{countryList(c.preferredCountries, c.names) || <span className="muted">None given</span>}</dd>
          <dt>Restricted countries</dt>
          <dd>{countryList(c.restrictedCountries, c.names) || <span className="muted">None given</span>}</dd>
          <dt>Accessed from</dt>
          <dd>
            {countryList(c.remoteAccessCountries, c.names) || <span className="muted">No remote access</span>}
          </dd>
          <dt>Subprocessors</dt>
          <dd>{c.subprocessors}</dd>
        </dl>
      </section>

      {showSteps5to8 ? (
        <section className="card" data-section="provide-vendor">
          <div className="ch">
            <div>
              <h2>
                <span className="rq-num">5</span> How will you provide a vendor?
              </h2>
              <div className="sub">
                A vendor you add yourself does not need to be in the OffshoreAssure directory before it can be
                assessed.
              </div>
            </div>
          </div>
          <div className="vs-modes pad" role="radiogroup" aria-label="Vendor selection mode">
            {MODES.map((m, i) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                className={'vs-mode' + (mode === m.id ? ' on' : '')}
                onClick={() => setMode(m.id)}
                data-mode={m.id}
              >
                <span className="rq-num">{i + 1}</span>
                <span>
                  <b>{m.title}</b>
                  <span className="note">{m.text}</span>
                </span>
              </button>
            ))}
          </div>
          {mode === 'DIRECTORY_SEARCH' ? (
            <DirectorySearch
              reference={ref}
              def={def}
              names={names}
              candidateIds={st.candidates.map(v => v.id)}
              onChange={changed}
            />
          ) : null}
          {mode === 'EXISTING_VENDOR' ? (
            <ExistingVendor
              reference={ref}
              def={def}
              serviceCategories={
                def.onboardingGroups.flatMap(g => g.fields).find(f => f.key === 'serviceCategory').options
              }
              onChange={changed}
            />
          ) : null}
          {mode === 'ADD_NEW_VENDOR' ? <OwnVendorForm reference={ref} def={def} onChange={changed} /> : null}
        </section>
      ) : null}

      <section className="card" data-section="shortlist">
        <div className="ch">
          <div>
            <h2>
              <span className="rq-num">7</span> Candidates and comparison
            </h2>
            <div className="sub">
              Directory vendors are ranked by fit score (
              {st.weights.map(w => `${w.criterion.toLowerCase()} ${w.weight}%`).join(', ')}). {st.scoreNote} A
              vendor you added or reused is shown on its own, without a rank.
            </div>
          </div>
          <span className="note">{st.candidates.length}</span>
        </div>
        {!st.candidates.length ? (
          <p className="note pad">No candidates yet. Use one of the three options above.</p>
        ) : null}
        {directory.length ? (
          <DirectoryComparison
            list={directory}
            names={names}
            selectedId={cur?.vendorId}
            busy={busy}
            onRemove={remove}
          />
        ) : null}
        {single.length ? (
          <div className="pad stack">
            {single.map(v => (
              <SingleVendorSummary
                key={v.id}
                v={v}
                names={names}
                reference={ref}
                selectedId={cur?.vendorId}
                busy={busy}
                onRemove={remove}
              />
            ))}
          </div>
        ) : null}
      </section>

      {showSteps5to8 ? (
        <ConfirmSelection
          key={(cur?.id || 'new') + st.candidates.length}
          st={st}
          reference={ref}
          me={user?.id}
          changing={changing}
          innerRef={confirmRef}
          onCancel={() => setChanging(false)}
          onSaved={(state, text) => {
            changed(state, text);
            setChanging(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      ) : null}
    </div>
  );
}
