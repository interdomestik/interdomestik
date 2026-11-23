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

/**
 * One card instance per member (keyed by the member id): no state, request or late answer of one
 * member can reach the card of another, because the previous member's instance is unmounted.
 */
export function MemberNotesCard(props: Readonly<MemberNotesCardProps>) {
  return <MemberNotesCardForMember key={props.memberId} {...props} />;
}

function MemberNotesCardForMember({ memberId, memberName }: Readonly<MemberNotesCardProps>) {
  const t = useTranslations('agent.notes');
  const [notes, setNotes] = useState<MemberNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<MemberNote | null>(null);
  const [isPending, startTransition] = useTransition();
  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState<NoteType>('general');
  // Whether this member's card is still on screen, and the latest list request: an answer that
  // arrives after the card left, or for a request a newer one replaced, is dropped.
  const mounted = useRef(true);
  const listRequest = useRef(0);

  const resetForm = () => {
    setEditingNote(null);
    setNoteContent('');
    setNoteType('general');
  };

  const fetchNotes = useCallback(async () => {
    const request = ++listRequest.current;
    const result = await getMemberNotes({ memberId });
    if (!mounted.current || request !== listRequest.current) return;
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
    mounted.current = true;
    void fetchNotes();
    return () => {
      mounted.current = false;
    };
  }, [fetchNotes]);

  // A refused change may mean access ended: show the toast, then re-read the list, which clears
  // the rows and closes the editor if the member is no longer reachable.
  const refuse = async (error: string | undefined, fallback: string) => {
    toast.error(error || t(fallback));
    await fetchNotes();
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
    const editing = editingNote;

    startTransition(async () => {
      const result = editing
        ? await updateMemberNote({ id: editing.id, content: noteContent, type: noteType })
        : await createMemberNote({ memberId, content: noteContent, type: noteType });
      if (!mounted.current) return;
      if (!result.success) {
        await refuse(result.error, editing ? 'updateError' : 'createError');
        return;
      }
      toast.success(editing ? t('noteUpdated') : t('noteCreated'));
      handleCloseDialog();
      await fetchNotes();
    });
  };

  const handleDelete = (noteId: string) => {
    startTransition(async () => {
      const result = await deleteMemberNote({ noteId });
      if (!mounted.current) return;
      if (!result.success) {
        await refuse(result.error, 'deleteError');
        return;
      }
      toast.success(t('noteDeleted'));
      setNotes(prev => prev.filter(n => n.id !== noteId));
    });
  };

  const handleTogglePin = (noteId: string) => {
    startTransition(async () => {
      const result = await toggleNotePin({ noteId });
      if (!mounted.current) return;
      if (!result.success) {
        await refuse(result.error, 'pinError');
        return;
      }
      const isPinned = result.data?.isPinned;
      // A success without the new state: read the list again rather than guess.
      if (isPinned === undefined) {
        await fetchNotes();
        return;
      }
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
