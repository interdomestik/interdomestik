import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from '@interdomestik/ui';
import { useTranslations } from 'next-intl';

interface VerificationActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingDecision: 'reject' | 'needs_info' | null;
  note: string;
  onNoteChange: (note: string) => void;
  onSubmit: () => void;
}

export function VerificationActionDialog({
  open,
  onOpenChange,
  pendingDecision,
  note,
  onNoteChange,
  onSubmit,
}: VerificationActionDialogProps) {
  const t = useTranslations('admin.leads');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {pendingDecision === 'reject' ? t('actions.reject') : t('dialogs.needs_info_title')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-4">
          <Label>{t('labels.note')}</Label>
          <Textarea
            value={note}
            onChange={e => onNoteChange(e.target.value)}
            placeholder={t('placeholders.needs_info_note')}
            data-testid="verification-action-note"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button
            onClick={onSubmit}
            variant={pendingDecision === 'reject' ? 'destructive' : 'default'}
            data-testid="verification-action-submit"
          >
            {t('actions.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
