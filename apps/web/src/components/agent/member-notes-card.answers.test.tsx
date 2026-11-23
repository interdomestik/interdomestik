import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The support module registers the module doubles (vi.mock), so it is imported before the card.
import { actions, deferred, note, toast } from './member-notes-card.test-support';
import { MemberNotesCard } from './member-notes-card';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('MemberNotesCard answers across members and refreshes', () => {
  it('is one instance per member: the card is keyed by the member id', () => {
    // The key is the guarantee: jsdom's act() cannot open the commit-to-effect window.
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

  it('drops an older answer for the same member that settles after a newer one', async () => {
    const older = deferred<unknown>();
    const newer = deferred<unknown>();
    actions.getMemberNotes
      .mockResolvedValueOnce({ success: true, data: [note('n1', 'm1'), note('n2', 'm1')] })
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    actions.toggleNotePin.mockResolvedValue({ success: false, code: 'NOT_FOUND', error: 'x' });
    actions.deleteMemberNote.mockResolvedValue({ success: false, code: 'NOT_FOUND', error: 'y' });
    render(<MemberNotesCard memberId="m1" memberName="Member One" />);
    await screen.findByTestId('note-n1');

    // Two refused changes, two refreshes of the same member in flight.
    fireEvent.click(screen.getByText('pin n1'));
    await waitFor(() => expect(actions.getMemberNotes).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByText('delete n2'));
    await waitFor(() => expect(actions.getMemberNotes).toHaveBeenCalledTimes(3));

    await act(async () => {
      newer.resolve({ success: true, data: [note('n1', 'm1')] });
      await newer.promise;
    });
    await act(async () => {
      older.resolve({
        success: true,
        data: [note('n1', 'm1'), note('n2', 'm1'), note('n3', 'm1')],
      });
      await older.promise;
    });
    expect(screen.getByTestId('note-n1')).toBeTruthy();
    expect(screen.queryByTestId('note-n2')).toBeNull();
    expect(screen.queryByTestId('note-n3')).toBeNull();
  });
});
