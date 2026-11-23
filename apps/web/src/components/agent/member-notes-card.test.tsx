import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({
  getMemberNotes: vi.fn(),
  createMemberNote: vi.fn(),
  updateMemberNote: vi.fn(),
  deleteMemberNote: vi.fn(),
  toggleNotePin: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('@/actions/member-notes', () => actions);
vi.mock('sonner', () => ({ toast }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@interdomestik/ui', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));
vi.mock('./member-note-item', () => ({
  MemberNoteItem: ({
    note,
    onEdit,
    onDelete,
    onTogglePin,
  }: {
    note: { id: string; content: string; isPinned: boolean };
    onEdit: (note: unknown) => void;
    onDelete: (id: string) => void;
    onTogglePin: (id: string) => void;
  }) => (
    <div data-testid={`note-${note.id}`} data-pinned={String(note.isPinned)}>
      {note.content}
      <button type="button" onClick={() => onEdit(note)}>
        edit {note.id}
      </button>
      <button type="button" onClick={() => onDelete(note.id)}>
        delete {note.id}
      </button>
      <button type="button" onClick={() => onTogglePin(note.id)}>
        pin {note.id}
      </button>
    </div>
  ),
}));
vi.mock('./member-note-dialog', () => ({
  MemberNoteDialog: ({
    open,
    noteContent,
    onContentChange,
    onSubmit,
  }: {
    open: boolean;
    noteContent: string;
    onContentChange: (value: string) => void;
    onSubmit: () => void;
  }) =>
    open ? (
      <div data-testid="editor">
        <textarea
          aria-label="content"
          value={noteContent}
          onChange={event => onContentChange(event.target.value)}
        />
        <button type="button" onClick={onSubmit}>
          submit
        </button>
      </div>
    ) : null,
}));

import { MemberNotesCard } from './member-notes-card';

const note = (id: string, memberId: string, extra: Record<string, unknown> = {}) => ({
  id,
  memberId,
  authorId: 'agent-a',
  authorName: 'Agent A',
  type: 'general',
  content: `content ${id}`,
  isPinned: false,
  isInternal: true,
  followUpDate: null,
  createdAt: new Date('2026-11-23T08:00:00Z'),
  updatedAt: null,
  ...extra,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('MemberNotesCard', () => {
  it('asks for the notes with an object input and shows them', async () => {
    actions.getMemberNotes.mockResolvedValue({ success: true, data: [note('n1', 'm1')] });
    render(<MemberNotesCard memberId="m1" memberName="Member One" />);

    expect(await screen.findByTestId('note-n1')).toBeTruthy();
    expect(actions.getMemberNotes).toHaveBeenCalledWith({ memberId: 'm1' });
  });

  it('re-reads after a refused edit and, when access ended, clears the rows and the open editor', async () => {
    actions.getMemberNotes
      .mockResolvedValueOnce({ success: true, data: [note('n1', 'm1')] })
      .mockResolvedValueOnce({ success: false, code: 'FORBIDDEN', error: 'Access denied' });
    actions.updateMemberNote.mockResolvedValue({
      success: false,
      code: 'FORBIDDEN',
      error: 'Not found',
    });
    render(<MemberNotesCard memberId="m1" memberName="Member One" />);
    await screen.findByTestId('note-n1');

    fireEvent.click(screen.getByText('edit n1'));
    fireEvent.change(screen.getByLabelText('content'), { target: { value: 'late edit' } });
    fireEvent.click(screen.getByText('submit'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Not found'));
    await waitFor(() => expect(screen.queryByTestId('note-n1')).toBeNull());
    expect(actions.getMemberNotes).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('editor')).toBeNull();
    expect(screen.getByText('noNotes')).toBeTruthy();
  });

  it('clears the rows when the refresh after a successful create is refused', async () => {
    actions.getMemberNotes
      .mockResolvedValueOnce({ success: true, data: [note('n1', 'm1')] })
      .mockResolvedValueOnce({ success: false, code: 'FORBIDDEN', error: 'Access denied' });
    actions.createMemberNote.mockResolvedValue({ success: true, data: note('n2', 'm1') });
    render(<MemberNotesCard memberId="m1" memberName="Member One" />);
    await screen.findByTestId('note-n1');

    fireEvent.click(screen.getByText('addNote'));
    fireEvent.change(screen.getByLabelText('content'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByText('submit'));

    await waitFor(() => expect(screen.queryByTestId('note-n1')).toBeNull());
    expect(screen.getByText('noNotes')).toBeTruthy();
  });

  it('keeps the editor open and shows the error when a create is refused', async () => {
    actions.getMemberNotes.mockResolvedValue({ success: true, data: [] });
    actions.createMemberNote.mockResolvedValue({
      success: false,
      code: 'FORBIDDEN',
      error: 'Access denied',
    });
    render(<MemberNotesCard memberId="m1" memberName="Member One" />);
    await screen.findByText('noNotes');

    fireEvent.click(screen.getByText('addNote'));
    fireEvent.change(screen.getByLabelText('content'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByText('submit'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Access denied'));
    expect(actions.createMemberNote).toHaveBeenCalledWith({
      memberId: 'm1',
      content: 'hello',
      type: 'general',
    });
    // The list is read again; it still answers, so the editor stays open with its content.
    await waitFor(() => expect(actions.getMemberNotes).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('editor')).toBeTruthy();
    expect(screen.getByLabelText('content')).toHaveProperty('value', 'hello');
  });

  it('branches on success first for pin and delete', async () => {
    actions.getMemberNotes.mockResolvedValue({
      success: true,
      data: [note('n1', 'm1'), note('n2', 'm1')],
    });
    actions.toggleNotePin
      .mockResolvedValueOnce({ success: false, code: 'NOT_FOUND', error: 'Not found' })
      .mockResolvedValueOnce({ success: true, data: { isPinned: true } });
    actions.deleteMemberNote
      .mockResolvedValueOnce({ success: false, code: 'FORBIDDEN', error: 'nope' })
      .mockResolvedValueOnce({ success: true });
    render(<MemberNotesCard memberId="m1" memberName="Member One" />);
    await screen.findByTestId('note-n1');

    fireEvent.click(screen.getByText('pin n1'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Not found'));
    expect(screen.getByTestId('note-n1').dataset.pinned).toBe('false');
    fireEvent.click(screen.getByText('pin n1'));
    await waitFor(() => expect(screen.getByTestId('note-n1').dataset.pinned).toBe('true'));
    expect(actions.toggleNotePin).toHaveBeenCalledWith({ noteId: 'n1' });

    fireEvent.click(screen.getByText('delete n2'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('nope'));
    expect(screen.getByTestId('note-n2')).toBeTruthy();
    fireEvent.click(screen.getByText('delete n2'));
    await waitFor(() => expect(screen.queryByTestId('note-n2')).toBeNull());
    expect(actions.deleteMemberNote).toHaveBeenCalledWith({ noteId: 'n2' });
  });

  it('reads the list again when a pin succeeds without its new state', async () => {
    actions.getMemberNotes
      .mockResolvedValueOnce({ success: true, data: [note('n1', 'm1')] })
      .mockResolvedValueOnce({ success: true, data: [note('n1', 'm1', { isPinned: true })] });
    actions.toggleNotePin.mockResolvedValue({ success: true });
    render(<MemberNotesCard memberId="m1" memberName="Member One" />);
    await screen.findByTestId('note-n1');

    fireEvent.click(screen.getByText('pin n1'));
    await waitFor(() => expect(screen.getByTestId('note-n1').dataset.pinned).toBe('true'));
    expect(actions.getMemberNotes).toHaveBeenCalledTimes(2);
  });

  it('is one instance per member: the card is keyed by the member id', () => {
    // The key is the guarantee: a late answer for the previous member can reach only that
    // member's unmounted instance, even in the window between a commit and its effects, which
    // jsdom's act() cannot open (it flushes effects before any answer settles).
    const element = MemberNotesCard({ memberId: 'm1', memberName: 'Member One' });
    expect(element.key).toBe('m1');
  });

  it('never shows the previous member’s late answer while the new member’s list is pending', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    actions.getMemberNotes.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { rerender } = render(<MemberNotesCard memberId="m1" memberName="Member One" />);
    rerender(<MemberNotesCard memberId="m2" memberName="Member Two" />);

    await act(async () => {
      first.resolve({ success: true, data: [note('n1', 'm1')] });
      await first.promise;
    });
    expect(screen.queryByTestId('note-n1')).toBeNull();
    expect(screen.getByText('loading')).toBeTruthy();

    await act(async () => {
      second.resolve({ success: true, data: [note('n9', 'm2')] });
      await second.promise;
    });
    expect(screen.getByTestId('note-n9')).toBeTruthy();
    expect(screen.queryByTestId('note-n1')).toBeNull();
  });

  it('drops a superseded list answer when the member changes', async () => {
    const first = deferred<unknown>();
    actions.getMemberNotes
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ success: true, data: [note('n9', 'm2')] });
    const { rerender } = render(<MemberNotesCard memberId="m1" memberName="Member One" />);

    rerender(<MemberNotesCard memberId="m2" memberName="Member Two" />);
    expect(await screen.findByTestId('note-n9')).toBeTruthy();

    await act(async () => {
      first.resolve({ success: true, data: [note('n1', 'm1')] });
      await first.promise;
    });
    expect(screen.queryByTestId('note-n1')).toBeNull();
    expect(screen.getByTestId('note-n9')).toBeTruthy();
  });

  it('closes the editor on a member switch and ignores a submit still pending for the old member', async () => {
    const pendingCreate = deferred<unknown>();
    actions.getMemberNotes
      .mockResolvedValueOnce({ success: true, data: [note('n1', 'm1')] })
      .mockResolvedValueOnce({ success: true, data: [] });
    actions.createMemberNote.mockReturnValueOnce(pendingCreate.promise);
    const { rerender } = render(<MemberNotesCard memberId="m1" memberName="Member One" />);
    await screen.findByTestId('note-n1');

    fireEvent.click(screen.getByText('edit n1'));
    expect(screen.getByLabelText('content')).toHaveProperty('value', 'content n1');
    fireEvent.click(screen.getByText('addNote'));
    fireEvent.change(screen.getByLabelText('content'), { target: { value: 'for m1' } });
    fireEvent.click(screen.getByText('submit'));

    rerender(<MemberNotesCard memberId="m2" memberName="Member Two" />);
    expect(screen.queryByTestId('editor')).toBeNull();
    expect(screen.queryByTestId('note-n1')).toBeNull();
    await screen.findByText('noNotes');

    await act(async () => {
      pendingCreate.resolve({ success: true, data: note('n5', 'm1') });
      await pendingCreate.promise;
    });
    expect(toast.success).not.toHaveBeenCalled();
    expect(actions.getMemberNotes).toHaveBeenCalledTimes(2);
    expect(actions.getMemberNotes).toHaveBeenLastCalledWith({ memberId: 'm2' });
    expect(screen.queryByTestId('note-n5')).toBeNull();
  });
});
