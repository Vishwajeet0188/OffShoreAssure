import { RULEBASE_VERSION } from '../../data/prototype-data.js';
import { MODS } from '../../lib/constants.js';
import { useAssessment } from '../../hooks/useAssessment.js';
import { Icon, BackArrow } from '../common/Icon.jsx';
import { Logo, Waves } from './Brand.jsx';

/* Aubergine module sidebar. "Reports" opens the final assessment on its /reports route. */
export default function Sidebar() {
  const { a, route, act } = useAssessment();
  const openActs = a ? a.actions.filter(x => x.status !== 'Complete').length : 0;
  return (
    <aside className="side">
      <Waves />
      <button className="brand brandlink" data-act="go" data-v="home" title="OffshoreAssure home" onClick={() => act.go('home')}>
        <span className="wm"><Logo /><b>Offshore<br />Assure</b></span><small>Assurance for the connected world.</small>
      </button>
      <nav className="mods" aria-label="Modules">
        {MODS.map(([id, label, icon, views]) => (
          <button key={id} className={'mod' + (views.includes(route.view) ? ' on' : '')} data-act="go" data-v={id} title={label} onClick={() => act.go(id === 'final' ? 'reports' : id)}>
            <Icon n={icon} s={19} /><span className="lbl">{label}</span>
            {id === 'actions' && openActs ? <span className="cnt">{openActs}</span> : null}
          </button>
        ))}
      </nav>
      <button className="mod" data-act="go" data-v="home" style={{ marginTop: 'auto' }} title="Public home page" onClick={() => act.go('home')}>
        <BackArrow s={17} /><span className="lbl">Back to home page</span>
      </button>
      <div className="foot" style={{ marginTop: 0 }}><span>v1.0.0</span><span>|</span><span>Prototype · {RULEBASE_VERSION}</span></div>
    </aside>
  );
}
