import { action, copy, enterContact, set, show, submit } from './claim-case-register.test-support';
import { waitFor, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClaimCorrespondenceForm } from './ClaimCorrespondenceForm';
import {
  claimId,
  occurredAt,
  documents,
  recovery,
  representation,
  consent,
  outbound,
} from './claim-case-register.test-fixture';

describe('correspondence form', () => {
  it('records an inbound reply and reuses its correlation id after transport failure', async () => {
    action.inbound.mockRejectedValueOnce(new Error('connection interrupted'));
    show(
      <ClaimCorrespondenceForm
        claimId={claimId}
        authorities={[]}
        documents={[]}
        entries={[outbound]}
        maxSharedDocuments={20}
      />
    );
    enterContact();
    set(copy.entry.replyTo, outbound.id);
    submit(copy.entry.record);
    expect(await screen.findByRole('alert', {}, { timeout: 5_000 })).toHaveTextContent(
      copy.feedback.failed
    );
    // The retry must not race the first attempt's pending state.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: copy.entry.record })).not.toHaveAttribute(
        'aria-disabled',
        'true'
      )
    );
    submit(copy.entry.record);
    expect(await screen.findByText(copy.feedback.saved, {}, { timeout: 5_000 })).toBeVisible();
    const request = action.inbound.mock.calls[0]?.[0];
    expect(request).toEqual({
      claimId,
      inReplyToId: outbound.id,
      partyKind: 'insurer',
      partyOrganisation: 'Synthetic insurer',
      occurredAt,
      body: 'Synthetic reply',
      channel: 'email',
      partyReference: null,
      partyContactName: null,
      correlationId: expect.stringMatching(/^[a-f\d-]{36}$/),
    });
    expect(action.inbound).toHaveBeenNthCalledWith(2, request);
    expect(action.outbound).not.toHaveBeenCalled();
  });

  it('requires a disclosure confirmation when selecting a sent document', async () => {
    show(
      <ClaimCorrespondenceForm
        claimId={claimId}
        authorities={[recovery, representation, consent]}
        documents={documents}
        entries={[]}
        maxSharedDocuments={20}
      />
    );
    set(copy.entry.directionLabel, 'outbound');
    enterContact();
    set(copy.authorities.kinds.recovery_agreement, recovery.id);
    set(copy.authorities.kinds.power_of_attorney, representation.id);
    fireEvent.click(screen.getByRole('checkbox', { name: documents[0].name }));
    set(copy.authorities.kinds.consent_or_lawful_basis, consent.id);
    submit(copy.entry.record);
    expect(action.outbound).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: copy.entry.attestSharing }));
    submit(copy.entry.record);
    expect(await screen.findByText(copy.feedback.saved, {}, { timeout: 5_000 })).toBeVisible();
    expect(action.outbound).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        claimId,
        sharedDocumentIds: [documents[0].id],
        recoveryAuthorityId: recovery.id,
        representationAuthorityId: representation.id,
        sharingAuthorityId: consent.id,
        sharingCoveredByConsentConfirmed: true,
      })
    );
  });

  it('shows the outbound limit and keeps an unchecked document unavailable at 20 selections', () => {
    const options = Array.from({ length: 21 }, (_, index) => ({
      id: `doc-${index + 1}`,
      name: `Evidence ${index + 1}`,
    }));
    show(
      <ClaimCorrespondenceForm
        claimId={claimId}
        authorities={[]}
        documents={options}
        entries={[]}
        maxSharedDocuments={20}
      />
    );
    set(copy.entry.directionLabel, 'outbound');
    expect(screen.getByText('Select up to 20 documents.')).toBeVisible();
    const picker = screen.getByRole('group', { name: copy.entry.documents });
    const checkboxes = within(picker).getAllByRole('checkbox');
    for (const checkbox of checkboxes.slice(0, 20)) fireEvent.click(checkbox);
    expect(checkboxes[19]).toBeChecked();
    expect(checkboxes[20]).toBeDisabled();
    fireEvent.click(checkboxes[0]!);
    expect(checkboxes[20]).toBeEnabled();
  });

  it.each(['keep', 'remove'])(
    'requires an explicit choice to %s a selection after refresh',
    async choice => {
      const options = Array.from({ length: 100 }, (_, index) => ({
        id: `doc-${index + 1}`,
        name: `Evidence ${index + 1}`,
      }));
      const last = options[99]!;
      const form = (pickerDocuments: typeof options) => (
        <ClaimCorrespondenceForm
          claimId={claimId}
          authorities={[recovery, representation, consent]}
          documents={pickerDocuments}
          entries={[]}
          maxSharedDocuments={20}
        />
      );
      const view = show(form(options));
      set(copy.entry.directionLabel, 'outbound');
      enterContact();
      set(copy.authorities.kinds.recovery_agreement, recovery.id);
      set(copy.authorities.kinds.power_of_attorney, representation.id);
      fireEvent.click(screen.getByRole('checkbox', { name: last.name }));
      set(copy.authorities.kinds.consent_or_lawful_basis, consent.id);
      fireEvent.click(screen.getByRole('checkbox', { name: copy.entry.attestSharing }));

      view.rerender(form([{ id: 'doc-new', name: 'New evidence' }, ...options.slice(0, 99)]));

      expect(screen.getByRole('checkbox', { name: 'New evidence' })).not.toBeChecked();
      const unlisted = screen.getByRole('group', { name: 'Evidence 100 is no longer listed.' });
      expect(unlisted).toBeVisible();
      expect(screen.getByRole('checkbox', { name: copy.entry.attestSharing })).toBeChecked();
      const save = screen.getByRole('button', { name: copy.entry.record });
      expect(save).toBeDisabled();
      fireEvent.submit(screen.getByRole('form', { name: copy.entry.title }));
      expect(action.outbound).not.toHaveBeenCalled();

      if (choice === 'keep') {
        fireEvent.click(
          within(unlisted).getByRole('checkbox', { name: copy.entry.keepUnlistedDocument })
        );
      } else {
        fireEvent.click(
          within(unlisted).getByRole('button', { name: copy.entry.removeUnlistedDocument })
        );
      }
      expect(save).toBeEnabled();
      submit(copy.entry.record);
      expect(await screen.findByText(copy.feedback.saved, {}, { timeout: 5_000 })).toBeVisible();
      expect(action.outbound).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ sharedDocumentIds: choice === 'keep' ? [last.id] : [] })
      );
    }
  );
});
