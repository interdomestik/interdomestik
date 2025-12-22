'use client';

import { NoteType } from '@/actions/member-notes';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Textarea,
} from '@interdomestik/ui';
import { useTranslations } from 'next-intl';

import { noteTypeIcons, noteTypes } from './member-notes-constants';

interface MemberNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isEditing: boolean;
  noteContent: string;
  noteType: NoteType;
  isPending: boolean;
  onContentChange: (content: string) => void;
  onTypeChange: (type: NoteType) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function MemberNoteDialog({
  open,
  onOpenChange,
  isEditing,
  noteContent,
  noteType,
  isPending,
  onContentChange,
  onTypeChange,
  onSubmit,
  onCancel,
}: MemberNoteDialogProps) {
  const t = useTranslations('Agent.notes');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditing ? t('editNote') : t('newNote')}</SheetTitle>
          <SheetDescription>{t('noteDescription')}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('noteType')}</label>
            <Select value={noteType} onValueChange={v => onTypeChange(v as NoteType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {noteTypes.map(type => (
                  <SelectItem key={type} value={type}>
                    <span className="flex items-center gap-2">
                      {noteTypeIcons[type]}
                      {t(`types.${type}`)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('noteContent')}</label>
            <Textarea
              value={noteContent}
              onChange={e => onContentChange(e.target.value)}
              placeholder={t('noteContentPlaceholder')}
              rows={6}
            />
          </div>
        </div>
        <SheetFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button onClick={onSubmit} disabled={isPending || !noteContent.trim()}>
            {isPending ? t('saving') : isEditing ? t('update') : t('create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
