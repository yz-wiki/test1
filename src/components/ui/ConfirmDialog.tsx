import ReactDOM from 'react-dom';
import { useModalFocus } from '../../hooks/useModalFocus';
import { Button } from '../../ui';

export interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The app-wide confirmation. Uses the same scrim, sheet geometry and button
 * vocabulary as every other overlay, so a destructive prompt looks like part of
 * the product rather than a separate era of it.
 */
export default function ConfirmDialog({
  title, message, confirmLabel, cancelLabel = 'Cancel', danger, onConfirm, onCancel,
}: ConfirmDialogProps) {
  // Shares the modal stack so a parent dialog cannot also consume Tab/Escape
  // while this higher-z confirmation owns keyboard interaction.
  const dialogRef = useModalFocus<HTMLDivElement>(onCancel);

  // Portaled to document.body so the overlay isn't trapped inside a parent
  // stacking context — without this it renders below body-level modal portals.
  const dialog = (
    <div
      className="ui-scrim"
      style={{ zIndex: 2000 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="ui-sheet"
        style={{ width: 420, maxWidth: '90vw' }}
      >
        <div className="ui-sheet__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
          <h2 id="confirm-dialog-title" className="ui-sheet__title">{title}</h2>
          <p id="confirm-dialog-message" className="ui-sub" style={{ margin: '0' }}>{message}</p>
        </div>
        <footer className="ui-sheet__foot">
          <Button onClick={onCancel}>{cancelLabel}</Button>
          <Button tone={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </footer>
      </div>
    </div>
  );

  return ReactDOM.createPortal(dialog, document.body);
}
