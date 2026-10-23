/* A small spinner with text, used while a page loads its data. */
export default function Loading({ text = 'Loading…', pad = false }) {
  return (
    <p className={'loading note' + (pad ? ' pad' : '')} role="status">
      <span className="spinner" aria-hidden="true" />
      {text}
    </p>
  );
}
