/* Date and text formatters (unchanged from the plain-JS prototype). */
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtDate = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
export const fmtShort = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const fmtTime = iso => { const d = new Date(iso); return fmtShort(iso) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); };
export const ago = iso => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago'; };
export const clone = o => JSON.parse(JSON.stringify(o));
