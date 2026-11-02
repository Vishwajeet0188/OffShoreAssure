import { Link } from 'react-router-dom';
import { PageHead } from '../../components/common/PageHead.jsx';
import { Icon } from '../../components/common/Icon.jsx';

/* Admin pages whose data arrives with a later stage. They describe what the page will hold; no sample data is shown. */
export const LATER_PAGES = {
  evidence: {
    stage: 'Later stage', party: 'Suppliers', title: 'Evidence review',
    lead: 'Documents and answers suppliers submit against the controls, queued for review by the OffshoreAssure team.',
    will: ['Queue of supplier submissions waiting for review', 'Accept, or request more information, with a recorded reason', 'Overdue requests by supplier and buyer', 'Document integrity (SHA-256 hash) and version'],
    depends: 'Suppliers respond to evidence requests.'
  }
};

export default function ComingStage({ page }) {
  const p = LATER_PAGES[page];
  return (
    <>
      <PageHead eyebrow={'Admin console · ' + p.party} title={p.title} lead={p.lead} />
      <div className="card adm-later">
        <div className="adm-later-head">
          <span className="adm-stage">Available from {p.stage}</span>
          <span className="note">This page fills in when that stage is built. No sample data is shown here.</span>
        </div>
        <div className="adm-later-body">
          <div>
            <h2>What the admin will see and control</h2>
            <ul className="adm-list">{p.will.map(w => <li key={w}><Icon n="check" s={16} />{w}</li>)}</ul>
          </div>
          <div className="adm-dep">
            <h2>Depends on</h2>
            <p>{p.depends}</p>
            <Link className="link" to="/admin">Back to overview</Link>
          </div>
        </div>
      </div>
    </>
  );
}
