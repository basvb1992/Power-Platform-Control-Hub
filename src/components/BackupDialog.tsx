import { useState } from 'react';
import type { ReactElement } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Field,
  Textarea,
  Button,
  tokens,
} from '@fluentui/react-components';

interface BackupDialogProps {
  open: boolean;
  environmentName: string;
  isLoading: boolean;
  onConfirm: (notes: string) => void;
  onCancel: () => void;
}

export default function BackupDialog({
  open,
  environmentName,
  isLoading,
  onConfirm,
  onCancel,
}: BackupDialogProps): ReactElement {
  const [notes, setNotes] = useState('');
  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) onCancel(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Create Backup — {environmentName}</DialogTitle>
          <DialogContent>
            <Field label="Backup notes (optional)" style={{ marginTop: tokens.spacingVerticalS }}>
              <Textarea
                value={notes}
                onChange={(_, data) => setNotes(data.value)}
                placeholder="e.g. Pre-release snapshot"
                rows={3}
              />
            </Field>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" disabled={isLoading} onClick={onCancel}>Cancel</Button>
            <Button appearance="primary" disabled={isLoading} onClick={() => onConfirm(notes)}>
              {isLoading ? 'Submitting…' : 'Create Backup'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
