import { USERS, JURISDICTIONS, VENDORS } from '../data/prototype-data.js';
import { useAssessment } from '../hooks/useAssessment.js';
import { Icon } from '../components/common/Icon.jsx';
import { Badge } from '../components/common/Badges.jsx';
import { PageHead } from '../components/common/Blocks.jsx';

/* Step 1 · Supplier discovery: create the assessment (/assessment/:assessmentId). */
export default function Assessment() {
  const { a, act } = useAssessment();
  const v = VENDORS[a.vendorId]; const j = JURISDICTIONS[v.country];
  const field = (id, label) => (
    <div className="field"><label htmlFor={'f-' + id}>{label}</label><input type="text" id={'f-' + id} data-bind={id} value={a[id] || ''} onChange={e => act.setField(id, e.target.value)} /></div>
  );
  const select = (id, label, opts) => (
    <div className="field"><label htmlFor={'f-' + id}>{label}</label>
      <select id={'f-' + id} data-bind={id} value={a[id]} onChange={e => act.setField(id, e.target.value)}>{opts.map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}</select>
    </div>
  );
  return (
    <>
      <PageHead eyebrow="Step 1 · Supplier discovery" title="Create assessment" lead="State the engagement: who is outsourcing, to whom, and what the service is. These inputs drive every later stage."
        right={<><span className="note">Load use case:</span><button className="btn sm" data-act="fill" data-k="uc1" onClick={() => act.fill('uc1')}>Use Case 1</button><button className="btn sm" data-act="fill" data-k="uc2" onClick={() => act.fill('uc2')}>Use Case 2</button></>} />
      <div className="grid g-side top-al">
        <div className="card pad"><div className="form">
          {field('org', 'Organisation')}
          {select('sector', 'Sector', [['Financial Services', 'Financial Services'], ['Healthcare', 'Healthcare'], ['Retail', 'Retail'], ['Professional Services', 'Professional Services']])}
          {field('name', 'Assessment name')}
          {select('category', 'Service category', [['Customer Support', 'Customer Support'], ['Managed IT Support', 'Managed IT Support'], ['Data Processing', 'Data Processing'], ['Software Development', 'Software Development']])}
          {select('owner', 'Assessment owner', USERS.map(u => [u.id, u.name + ' (' + u.role + ')']))}
          {select('vendorId', 'Service provider', Object.values(VENDORS).map(x => [x.id, x.name + ' · ' + x.country]))}
          <div className="field full"><label htmlFor="f-description">Service description</label><textarea id="f-description" data-bind="description" value={a.description || ''} onChange={e => act.setField('description', e.target.value)} /></div>
        </div></div>
        <div className="card pad stack">
          <div className="eyebrow">Selected supplier</div>
          <h2 className="serif" style={{ fontSize: 20 }}>{v.name}</h2>
          <dl className="kv"><dt>Location</dt><dd>{v.location + ', ' + v.country}</dd><dt>Service</dt><dd>{v.service}</dd>
            <dt>Destination status</dt><dd><Badge s={j.status === 'adequate' ? 'Adequate' : 'Restricted transfer'} label={j.status === 'adequate' ? 'UK adequacy' : 'Restricted transfer'} /></dd></dl>
          <p className="note">The Data Transfer engine looks the destination up again once the contract confirms where the data is processed.</p>
        </div>
      </div>
      <div className="row"><button className="btn primary" data-act="createNext" onClick={act.createNext}>Continue to requirement analysis <Icon n="arrow" s={15} /></button></div>
    </>
  );
}
