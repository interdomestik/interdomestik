'use client';

import {
  createMemberNote,
  deleteMemberNote,
  getMemberNotes,
  toggleNotePin,
  updateMemberNote,
  type MemberNote,
  type NoteType,
} from '@/actions/member-notes';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { MessageCircle, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { MemberNoteDialog } from './member-note-dialog';
import { MemberNoteItem } from './member-note-item';

interface MemberNotesCardProps {
  memberId: string;
  memberName: string;
}

export function MemberNotesCard({ memberId, memberName }: MemberNotesCardProps) {
  const t = useTranslations('agent.notes');
  const [notes, setNotes] = useState<MemberNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<MemberNote | null>(null);
  const [isPending, startTransition] = useTransition();
  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState<NoteType>('general');
  const [shownMemberId, setShownMemberId] = useState(memberId);
  // The member on screen now, and the latest list request: an answer for another member, or for
  // a request a newer one replaced, is dropped and never shown.
  const currentMemberId = useRef(memberId);
  const listRequest = useRef(0);

  const resetForm = () => {
    setEditingNote(null);
    setNoteContent('');
    setNoteType('general');
  };

  // Another member: nothing of the previous member stays on screen, not even in the editor.
  if (shownMemberId !== memberId) {
    setShownMemberId(memberId);
    setNotes([]);
    setIsLoading(true);
    setIsDialogOpen(false);
    resetForm();
  }

  const fetchNotes = useCallback(async () => {
    const request = ++listRequest.current;
    const result = await getMemberNotes({ memberId });
    if (request !== listRequest.current) return;
    if (result.success) {
      setNotes(result.data ?? []);
    } else {
      // Access ended (or the read failed): show no notes and close the editor.
      setNotes([]);
      setIsDialogOpen(false);
      setEditingNote(null);
      setNoteContent('');
      setNoteType('general');
    }
    setIsLoading(false);
  }, [memberId]);

  useEffect(() => {
    currentMemberId.current = memberId;
    void fetchNotes();
  }, [memberId, fetchNotes]);

  const isCurrent = (requestedFor: string) => currentMemberId.current === requestedFor;

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
    const requestedFor = memberId;
    const editing = editingNote;

    startTransition(async () => {
      const result = editing
        ? await updateMemberNote({ id: editing.id, content: noteContent, type: noteType })
        : await createMemberNote({ memberId: requestedFor, content: noteContent, type: noteType });
      if (!isCurrent(requestedFor)) return;
      if (!result.success) {
        toast.error(result.error || t(editing ? 'updateError' : 'createError'));
        return;
      }
      toast.success(editing ? t('noteUpdated') : t('noteCreated'));
      handleCloseDialog();
      await fetchNotes();
    });
  };

  const handleDelete = (noteId: string) => {
    const requestedFor = memberId;
    startTransition(async () => {
      const result = await deleteMemberNote({ noteId });
      if (!isCurrent(requestedFor)) return;
      if (!result.success) {
        toast.error(result.error || t('deleteError'));
        return;
      }
      toast.success(t('noteDeleted'));
      setNotes(prev => prev.filter(n => n.id !== noteId));
    });
  };

  const handleTogglePin = (noteId: string) => {
    const requestedFor = memberId;
    startTransition(async () => {
      const result = await toggleNotePin({ noteId });
      if (!isCurrent(requestedFor)) return;
      if (!result.success) {
        toast.error(result.error || t('pinError'));
        return;
      }
      const isPinned = result.data?.isPinned;
      if (isPinned === undefined) return;
      setNotes(prev => prev.map(n => (n.id === noteId ? { ...n, isPinned } : n)));
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
