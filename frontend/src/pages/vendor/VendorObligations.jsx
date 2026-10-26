import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { fmtTime } from '../../lib/format.js';
import { TYPE_TONE, describeTiming } from '../../lib/obligations.js';
import { PageHead } from '../../components/common/PageHead.jsx';
import { Icon } from '../../components/common/Icon.jsx';
import Loading from '../../components/extras/Loading.jsx';

/* Vendor portal · Obligations: assessments where the buyer has extracted the obligations (Stage 5). */
export function VendorObligationsList() {
  const [registers, setRegisters] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/vendor/obligations')
      .then(result => setRegisters(result.registers))
      .catch(err => setError(err.message));
  }, []);

  return (
    <>
      <PageHead
        eyebrow="Vendor · Obligations"
        title="Obligations"
        lead="What your company must do under each agreement with a UK buyer, stated plainly, with the clause it comes from."
      />
      <div className="card" data-section="vendor-obligations">
        {error ? <p className="form-err pad">{error}</p> : null}
        {!registers ? (
          <Loading pad />
        ) : registers.length === 0 ? (
          <p className="note pad">
            No obligations yet. They appear here after a buyer that selected your company has analysed the
            contract.
          </p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Assessment</th>
                  <th>Buyer</th>
                  <th>Your obligations</th>
                  <th>Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {registers.map(register => (
                  <tr key={register.reference}>
                    <td>
                      <b className="mono">{register.reference}</b>
                      <div className="note">{register.title}</div>
                    </td>
                    <td>{register.buyerName}</td>
                    <td>
                      {register.yourObligations}
                      <div className="note">from contract v{register.contractVersion}</div>
                    </td>
                    <td className="mono">{fmtTime(register.createdAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        className="btn sm primary"
                        to={'/vendor/obligations/' + register.reference}
                        data-act="open-vendor-obligations"
                      >
                        View
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

/* One assessment: the vendor's own obligations, grouped by topic. */
export default function VendorObligations() {
  const { ref } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/vendor/obligations/' + ref)
      .then(setData)
      .catch(err => setError(err.message));
  }, [ref]);

  if (error) return <p className="form-err">{error}</p>;
  if (!data) return <Loading />;

  const topicName = Object.fromEntries(data.topics.map(t => [t.id, t.name]));
  const groups = groupByTopic(data.obligations, topicName);

  return (
    <div className="vs">
      <Link
        className="link"
        to="/vendor/obligations"
        style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
      >
        ← Obligations
      </Link>
      <PageHead
        eyebrow={`Vendor · Obligations · ${data.reference}`}
        title={data.title}
        lead={`Your obligations to ${data.buyerName}, from contract v${data.contractVersion} (register v${data.version}, ${fmtTime(data.createdAt)}).`}
      />

      {groups.map(group => (
        <section key={group.name} className="card" data-section="vendor-obligation-group">
          <div className="ch">
            <div>
              <h2>{group.name}</h2>
            </div>
            <span className="note">{group.items.length}</span>
          </div>
          <ul className="ob-vlist">
            {group.items.map(obligation => (
              <li key={obligation.id}>
                <span className={'b ' + TYPE_TONE[obligation.type]}>
                  {obligation.type === 'Prohibition'
                    ? 'Must not'
                    : obligation.type === 'Right'
                      ? 'May'
                      : 'Must'}
                </span>
                <div>
                  <p>{obligation.text}</p>
                  <div className="note">
                    Clause {obligation.source.clauseNumber}
                    {describeTiming(obligation) ? (
                      <>
                        {' '}
                        · <b>{describeTiming(obligation)}</b>
                      </>
                    ) : null}
                    {obligation.party === 'both' ? ' · applies to both parties' : ''}
                  </div>
                  {obligation.type !== 'Right' && obligation.consequence ? (
                    <div className="note">
                      If missed: {obligation.consequence.text} (clause {obligation.consequence.clauseNumber})
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="ir-foot note">
        <Icon n="shield" s={14} /> {data.note}
      </p>
    </div>
  );
}

function groupByTopic(obligations, topicName) {
  const groups = new Map();
  for (const obligation of obligations) {
    const name = topicName[obligation.topics[0]] || 'Other obligations';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(obligation);
  }
  return [...groups.entries()].map(([name, items]) => ({ name, items }));
}
