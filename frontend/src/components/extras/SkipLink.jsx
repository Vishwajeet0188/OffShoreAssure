/* Hidden until it gets keyboard focus: lets keyboard users jump past the navigation. */
export default function SkipLink({ target = 'content' }) {
  return (
    <a className="skip-link" href={`#${target}`}>
      Skip to content
    </a>
  );
}
