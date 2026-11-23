import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '@/actions/member-notes',
  async () => (await import('./member-notes-card.test-support')).actions
);
vi.mock('sonner', async () => ({
  toast: (await import('./member-notes-card.test-support')).toast,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@interdomestik/ui', async () => (await import('./member-notes-card.test-support')).uiMock);
vi.mock(
  './member-note-item',
  async () => (await import('./member-notes-card.test-support')).noteItemMock
);
vi.mock(
  './member-note-dialog',
  async () => (await import('./member-notes-card.test-support')).noteDialogMock
);

import { MemberNotesCard } from './member-notes-card';
import { actions, note, toast } from './member-notes-card.test-support';

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

  it('closes the editor when the note it edits is gone after a refused edit', async () => {
    actions.getMemberNotes
      .mockResolvedValueOnce({ success: true, data: [note('n1', 'm1'), note('n2', 'm1')] })
      .mockResolvedValueOnce({ success: true, data: [note('n2', 'm1')] });
    actions.updateMemberNote.mockResolvedValue({
      success: false,
      code: 'NOT_FOUND',
      error: 'Not found',
    });
    render(<MemberNotesCard memberId="m1" memberName="Member One" />);
    await screen.findByTestId('note-n1');

    fireEvent.click(screen.getByText('edit n1'));
    fireEvent.change(screen.getByLabelText('content'), { target: { value: 'draft' } });
    fireEvent.click(screen.getByText('submit'));

    await waitFor(() => expect(screen.queryByTestId('note-n1')).toBeNull());
    expect(screen.queryByTestId('editor')).toBeNull();
    expect(screen.getByTestId('note-n2')).toBeTruthy();
  });
});
