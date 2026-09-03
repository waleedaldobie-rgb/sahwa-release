// @ts-nocheck
import React from 'react';
import { Modal, Button, Input } from './ui';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  reason?: string;
  reasonLabel?: string;
  onReasonChange?: (value: string) => void;
}

/**
 * Branded replacement for window.confirm().
 * Built on top of the existing Modal + Button components so delete
 * confirmations match the rest of the app's design (RTL, Arabic labels,
 * app styling) instead of the OS-native dialog.
 */
export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'حذف',
  cancelLabel = 'إلغاء',
  onConfirm,
  onCancel,
  reason,
  reasonLabel = 'السبب',
  onReasonChange
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      maxWidth="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-slate-700">{message}</p>
      {onReasonChange && (
        <div className="mt-4">
          <Input
            label={`${reasonLabel} *`}
            value={reason || ''}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="اكتب السبب"
          />
        </div>
      )}
    </Modal>
  );
};
