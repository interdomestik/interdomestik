'use client';

import { MemberNote } from '@/actions/member-notes';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@interdomestik/ui';
import { format, formatDistanceToNow } from 'date-fns';
import { Edit2, MoreVertical, Pin, PinOff, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { noteTypeColors, noteTypeIcons } from './member-notes-constants';

interface MemberNoteItemProps {
  note: MemberNote;
  onEdit: (note: MemberNote) => void;
  onDelete: (noteId: string) => void;
  onTogglePin: (noteId: string) => void;
}

export function MemberNoteItem({ note, onEdit, onDelete, onTogglePin }: MemberNoteItemProps) {
  const t = useTranslations('Agent.notes');

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        note.isPinned ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/30'
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              noteTypeColors[note.type]
            }`}
          >
            {noteTypeIcons[note.type]}
            {t(`types.${note.type}`)}
          </span>
          {note.isPinned && <Pin className="h-3 w-3 text-primary" />}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(note)}>
              <Edit2 className="mr-2 h-4 w-4" />
              {t('edit')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onTogglePin(note.id)}>
              {note.isPinned ? (
                <>
                  <PinOff className="mr-2 h-4 w-4" />
                  {t('unpin')}
                </>
              ) : (
                <>
                  <Pin className="mr-2 h-4 w-4" />
                  {t('pin')}
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(note.id)}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t('delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="whitespace-pre-wrap text-sm text-foreground">{note.content}</p>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span>{note.authorName}</span>
        <span>•</span>
        <span title={format(new Date(note.createdAt), 'PPpp')}>
          {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
        </span>
      </div>
    </div>
  );
}
