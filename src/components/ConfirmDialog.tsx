import type { ReactElement } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  tokens,
} from '@fluentui/react-components';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmAppearance?: 'primary' | 'secondary';
  isDangerous?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmAppearance = 'primary',
  isDangerous = false,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) onCancel(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>{message}</DialogContent>
          <DialogActions>
            <Button appearance="secondary" disabled={isLoading} onClick={onCancel}>
              Cancel
            </Button>
            <Button
              appearance={isDangerous ? 'outline' : confirmAppearance}
              disabled={isLoading}
              onClick={onConfirm}
              style={isDangerous ? {
                color: tokens.colorStatusDangerForeground1,
                borderColor: tokens.colorStatusDangerForeground1,
              } : undefined}
            >
              {isLoading ? 'Working…' : confirmLabel}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
