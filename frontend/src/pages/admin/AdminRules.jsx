import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { PageHead } from '../../components/common/PageHead.jsx';
import { Icon } from '../../components/common/Icon.jsx';
import Loading from '../../components/extras/Loading.jsx';

/* Admin · Rule base: the rule tables every engine applies, one section per stage (read-only). */
export default function AdminRules() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [stage, setStage] = useState(1);
  useEffect(() => {
    api('/admin/rules')
      .then(setData)
      .catch(err => setError(err.message));
  }, []);

  if (error) return <p className="form-err">{error}</p>;
  if (!data) return <Loading />;
  const pack = data.packs.find(p => p.stage === stage);

  return (
    <>
      <PageHead
        eyebrow="Admin console · Platform"
        title="Rule base"
        lead="The rules OffshoreAssure applies at each stage, exactly as the engines use them. Every result saves the version it used."
      />
      <div className="rq-flag info" style={{ marginBottom: 14 }}>
        <Icon n="shield" s={16} />
        <span>{data.note}</span>
      </div>
      <div className="rb-tabs" role="tablist" aria-label="Stage">
        {data.packs.map(p => (
          <button
            key={p.stage}
            role="tab"
            aria-selected={p.stage === stage}
            className={'rb-tab' + (p.stage === stage ? ' on' : '')}
            onClick={() => setStage(p.stage)}
            data-stage={p.stage}
          >
            <span className="journey-n">{p.stage}</span>
            {p.title}
          </button>
        ))}
      </div>
      <section className="card" data-section="rule-pack" data-stage={pack.stage}>
        <div className="ch">
          <div>
            <h2>
              Stage {pack.stage} · {pack.title}
            </h2>
            <div className="sub">
              Rule pack <span className="mono">{pack.version}</span> · {pack.file}
            </div>
          </div>
          <span className={'b ' + (/draft/.test(pack.version) ? 'b-amber' : 'b-sage')}>
            {/draft/.test(pack.version) ? 'Provisional' : 'Confirmed'}
          </span>
        </div>
        {pack.tables.map(t => (
          <div key={t.title} className="asr-block" data-table={t.title}>
            <h3>
              {t.title} <span className="note">({t.rows.length})</span>
            </h3>
            {t.note ? (
              <p className="note" style={{ marginTop: 0 }}>
                {t.note}
              </p>
            ) : null}
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    {t.columns.map(c => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j} className={j === 0 ? 'mono-ish' : ''}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
