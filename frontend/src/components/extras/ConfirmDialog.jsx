import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

/*
 * Asks "Are you sure?" before something that cannot easily be undone.
 *
 *   if (!(await confirmAction({ title: 'Remove this document?', confirmLabel: 'Remove' }))) return;
 *
 * Resolves true when the person confirms, false when they cancel, press Escape
 * or click outside the box.
 */
export function confirmAction(options) {
  return new Promise(resolve => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    function answer(value) {
      root.unmount();
      container.remove();
      resolve(value);
    }

    root.render(<ConfirmDialog {...options} onAnswer={answer} />);
  });
}

function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger = true, onAnswer }) {
  const cancelButton = useRef(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    cancelButton.current?.focus(); // the safe choice gets the focus
    const onKey = event => { if (event.key === 'Escape') onAnswer(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previousFocus?.focus?.();
    };
  }, [onAnswer]);

  return (
    <div className="modal-backdrop" onClick={() => onAnswer(false)}>
      <div className="card modal confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={e => e.stopPropagation()} data-section="confirm-dialog">
        <h2 id="confirm-title">{title}</h2>
        {message ? <p className="note">{message}</p> : null}
        <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" ref={cancelButton} onClick={() => onAnswer(false)}>Cancel</button>
          <button type="button" className={'btn ' + (danger ? 'danger' : 'primary')} onClick={() => onAnswer(true)} data-act="confirm-yes">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
