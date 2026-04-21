import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Locale } from '../../../shared/domain.js';

interface WorkbenchSettingsDialogProps {
  locale: Locale;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function WorkbenchSettingsDialog({ locale, isOpen, onClose, children }: WorkbenchSettingsDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }

      return;
    }

    if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    const handleCancel = (event: Event): void => {
      event.preventDefault();
      onClose();
    };

    const handleClose = (): void => {
      if (isOpen) {
        onClose();
      }
    };

    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('close', handleClose);

    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('close', handleClose);
    };
  }, [isOpen, onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="workbench-settings-dialog"
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div className="card workbench-settings-shell">
        <div className="workbench-settings-header">
          <div>
            <p className="section-label">{locale === 'zh' ? '工作台设置' : 'Workbench settings'}</p>
            <h3>{locale === 'zh' ? '切换目标并更新本次工作的基础设置' : 'Switch targets and update the shared work setup'}</h3>
          </div>
          <button type="button" className="secondary-button secondary-button-compact" onClick={onClose}>
            {locale === 'zh' ? '关闭' : 'Close'}
          </button>
        </div>

        <div className="workbench-settings-body">{children}</div>
      </div>
    </dialog>
  );
}
