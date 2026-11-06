/*
 * Small country flag from its ISO code ("GB", "PL"). The flag pictures come from the
 * flag-icons package; each one is a separate file, so a page only downloads the
 * flags it shows. Emoji flags are not used because Windows does not draw them.
 */
const FLAG_FILES = import.meta.glob('/node_modules/flag-icons/flags/4x3/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

function flagUrl(code) {
  return FLAG_FILES[`/node_modules/flag-icons/flags/4x3/${String(code).toLowerCase()}.svg`] || null;
}

export function Flag({ code, title }) {
  const url = code ? flagUrl(code) : null;

  if (!url) {
    return <span className="flag flag-code">{code || '—'}</span>;
  }

  return (
    <img className="flag" src={url} alt="" title={title || code} width={20} height={15} loading="lazy" />
  );
}
