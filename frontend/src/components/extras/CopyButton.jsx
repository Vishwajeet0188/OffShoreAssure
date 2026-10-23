import { useState } from 'react';

/* Copies a value (an Assessment ID, a fingerprint) to the clipboard and says so. */
export default function CopyButton({ value, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy this:', value); // clipboard not allowed: let the user copy by hand
    }
  }

  return (
    <button type="button" className="copy-btn" onClick={copy} aria-label={`${label}: ${value}`} title={copied ? 'Copied' : label} data-act="copy">
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
      )}
      <span className="copy-state" aria-live="polite">{copied ? 'Copied' : ''}</span>
    </button>
  );
}

/* The Assessment ID tag shown at the top of a stage page, with a copy button. */
export function ReferenceTag({ value }) {
  return (
    <span className="ref-tag">
      <span className="mono asr-tag">{value}</span>
      <CopyButton value={value} label="Copy the Assessment ID" />
    </span>
  );
}
