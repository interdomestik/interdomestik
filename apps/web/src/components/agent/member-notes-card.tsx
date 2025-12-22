'use client';

import {
  createMemberNote,
  deleteMemberNote,
  getMemberNotes,
  MemberNote,
  NoteType,
  toggleNotePin,
  updateMemberNote,
} from '@/actions/member-notes';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { MessageCircle, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { MemberNoteDialog } from './member-note-dialog';
import { MemberNoteItem } from './member-note-item';

interface MemberNotesCardProps {
  memberId: string;
  memberName: string;
}

export function MemberNotesCard({ memberId, memberName }: MemberNotesCardProps) {
  const t = useTranslations('Agent.notes');
  const [notes, setNotes] = useState<MemberNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<MemberNote | null>(null);
  const [isPending, startTransition] = useTransition();
  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState<NoteType>('general');

  const fetchNotes = useCallback(async () => {
    const result = await getMemberNotes(memberId);
    if (result.success && result.data) {
      setNotes(result.data);
    }
    setIsLoading(false);
  }, [memberId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const resetForm = () => {
    setEditingNote(null);
    setNoteContent('');
    setNoteType('general');
  };

  const handleOpenDialog = (note?: MemberNote) => {
    if (note) {
      setEditingNote(note);
      setNoteContent(note.content);
      setNoteType(note.type);
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    resetForm();
  };

  const handleSubmit = () => {
    if (!noteContent.trim()) return;

    startTransition(async () => {
      const result = editingNote
        ? await updateMemberNote({ id: editingNote.id, content: noteContent, type: noteType })
        : await createMemberNote({ memberId, content: noteContent, type: noteType });

      if (result.success) {
        toast.success(editingNote ? t('noteUpdated') : t('noteCreated'));
        fetchNotes();
        handleCloseDialog();
      } else {
        toast.error(result.error || t(editingNote ? 'updateError' : 'createError'));
      }
    });
  };

  const handleDelete = (noteId: string) => {
    startTransition(async () => {
      const result = await deleteMemberNote(noteId);
      if (result.success) {
        toast.success(t('noteDeleted'));
        setNotes(prev => prev.filter(n => n.id !== noteId));
      } else {
        toast.error(result.error || t('deleteError'));
      }
    });
  };

  const handleTogglePin = (noteId: string) => {
    startTransition(async () => {
      const result = await toggleNotePin(noteId);
      if (result.success && result.data) {
        setNotes(prev =>
          prev.map(n => (n.id === noteId ? { ...n, isPinned: result.data!.isPinned } : n))
        );
      } else {
        toast.error(result.error || t('pinError'));
      }
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <div className="animate-pulse text-muted-foreground">{t('loading')}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-lg font-semibold">{t('title')}</CardTitle>
          <Button size="sm" onClick={() => handleOpenDialog()}>
            <Plus className="mr-1 h-4 w-4" />
            {t('addNote')}
          </Button>
        </CardHeader>
        <CardContent>
          {notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MessageCircle className="mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{t('noNotes')}</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                {t('noNotesDescription', { name: memberName })}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {notes.map(note => (
                <MemberNoteItem
                  key={note.id}
                  note={note}
                  onEdit={handleOpenDialog}
                  onDelete={handleDelete}
                  onTogglePin={handleTogglePin}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <MemberNoteDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        isEditing={!!editingNote}
        noteContent={noteContent}
        noteType={noteType}
        isPending={isPending}
        onContentChange={setNoteContent}
        onTypeChange={setNoteType}
        onSubmit={handleSubmit}
        onCancel={handleCloseDialog}
      />
    </>
  );
}
