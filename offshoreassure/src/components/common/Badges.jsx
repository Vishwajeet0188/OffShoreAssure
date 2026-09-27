/* Status badges and inline tags (markup and classes identical to the plain-JS prototype). */
import { StatusIcon } from './Icon.jsx';
import { tone, CC, ENGINE } from '../../lib/constants.js';

export function Badge({ s, label, style }) {
  const t = tone(s);
  return <span className={'b b-' + t} style={style}>{StatusIcon[t]}{label != null ? label : s}</span>;
}
/* Neutral badge that is not tied to a status word (e.g. "Not triggered", "Not assessed"). */
export const MuteBadge = ({ children }) => <span className="b b-mute">{StatusIcon.mute}{children}</span>;
export const Sev = ({ s }) => <span className={'sev ' + s}>{s}</span>;
export const Rid = ({ id }) => <span className="rid">{id}</span>;
export const Cid = ({ id }) => <span className="cid">{id}</span>;
export const CountryCode = ({ c }) => <span className="cc" title={c}>{CC[c] || c.slice(0, 2).toUpperCase()}</span>;
export const ETag = ({ L }) => <span className="eletter" style={{ width: 22, height: 22, fontSize: 12, borderRadius: 6 }} title={ENGINE[L]}>{L}</span>;
export const Proto = ({ children = 'Prototype output' }) => <span className="proto">{children}</span>;
