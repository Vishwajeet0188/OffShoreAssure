/* Status badge: the tone (colour + icon) comes from the status word; the label is what the user reads. */
import { StatusIcon } from './Icon.jsx';

const TONE = {
  sage: ['Verified', 'Approved', 'Submitted', 'Complete', 'Accepted'],
  amber: ['Pending', 'In review', 'Attention', 'Draft', 'In progress'],
  coral: ['Restricted', 'Rejected', 'Action required'],
  plum: ['Info']
};
export const tone = s => Object.keys(TONE).find(k => TONE[k].includes(s)) || 'mute';

export function Badge({ s, label, style }) {
  const t = tone(s);
  return <span className={'b b-' + t} style={style}>{StatusIcon[t]}{label != null ? label : s}</span>;
}
export const MuteBadge = ({ children }) => <span className="b b-mute">{StatusIcon.mute}{children}</span>;
