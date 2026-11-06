/* "Last updated" date for the public pages: the date this version of the site was built. */
const BUILT_ON = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : null; // eslint-disable-line no-undef

export default function LastUpdated() {
  if (!BUILT_ON) return null;
  const date = new Date(BUILT_ON).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return <span className="last-updated">Last updated {date}</span>;
}
