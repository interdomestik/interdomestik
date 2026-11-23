import { action, copy, set, show, submit } from './claim-case-register.test-support';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClaimAuthoritiesPanel } from './ClaimAuthoritiesPanel';
import { ClaimCaseFieldsPanel } from './ClaimCaseFieldsPanel';
import { claimId, occurredAt, documents, recovery } from './claim-case-register.test-fixture';

describe('case details', () => {
  const fields = {
    otherVehicleCountryCode: null,
    insuranceProofReference: 'Sample reference',
    outsideHandlingParty: null,
    coverageVerificationStatus: 'not_checked' as const,
    caseFollowUpAt: null,
  };

  it('retains inputs during a pending save and retries a typed failure', async () => {
    type Failure = { success: false; code: string };
    let resolveSave!: (failure: Failure) => void;
    action.fields.mockReturnValueOnce(
      new Promise<Failure>(resolve => {
        resolveSave = resolve;
      })
    );
    show(<ClaimCaseFieldsPanel claimId={claimId} canWrite fields={fields} />);
    set(copy.caseFields.country, 'de');
    set(copy.caseFields.coverage, 'requested');
    set(copy.caseFields.caseFollowUpUtc, '2026-01-02T12:30');
    submit(copy.caseFields.save);
    expect(screen.getByRole('status')).toHaveTextContent(copy.feedback.saving);
    expect(screen.getByRole('button', { name: copy.caseFields.save })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    submit(copy.caseFields.save);
    expect(action.fields).toHaveBeenCalledExactlyOnceWith({
      claimId,
      ...fields,
      otherVehicleCountryCode: 'DE',
      coverageVerificationStatus: 'requested',
      caseFollowUpAt: occurredAt,
      expected: fields,
    });
    await act(() => {
      resolveSave({ success: false, code: 'invalid_state' });
      return Promise.resolve();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(copy.feedback.invalidState);
    expect(screen.getByLabelText(copy.caseFields.country)).toHaveValue('de');
    expect(action.refresh).not.toHaveBeenCalled();
    submit(copy.caseFields.save);
    expect(await screen.findByText(copy.feedback.saved)).toBeVisible();
    expect(action.refresh).toHaveBeenCalledOnce();
  });

  it('shows saved details without an editor for a read-only staff viewer', () => {
    show(<ClaimCaseFieldsPanel claimId={claimId} canWrite={false} fields={fields} />);
    expect(screen.getByText(fields.insuranceProofReference)).toBeVisible();
    expect(screen.queryByRole('button', { name: copy.caseFields.save })).not.toBeInTheDocument();
  });

  it('refreshes the inputs and expected snapshot together after a conflict', async () => {
    action.fields.mockResolvedValueOnce({ success: false, code: 'conflict' });
    const view = show(<ClaimCaseFieldsPanel claimId={claimId} canWrite fields={fields} />);
    set(copy.caseFields.insurance, 'Local insurance reference');
    submit(copy.caseFields.save);
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.feedback.conflict);
    expect(action.refresh).toHaveBeenCalledOnce();
    expect(action.fields).toHaveBeenNthCalledWith(1, {
      claimId,
      ...fields,
      insuranceProofReference: 'Local insurance reference',
      expected: fields,
    });

    const winning = {
      otherVehicleCountryCode: 'DE',
      insuranceProofReference: 'Winning insurance reference',
      outsideHandlingParty: 'Winning bureau',
      coverageVerificationStatus: 'requested' as const,
      caseFollowUpAt: occurredAt,
    };
    view.rerender(<ClaimCaseFieldsPanel claimId={claimId} canWrite fields={winning} />);
    expect(screen.getByLabelText(copy.caseFields.country)).toHaveValue('DE');
    expect(screen.getByLabelText(copy.caseFields.insurance)).toHaveValue(
      winning.insuranceProofReference
    );
    expect(screen.getByLabelText(copy.caseFields.outsideParty)).toHaveValue(
      winning.outsideHandlingParty
    );
    expect(screen.getByLabelText(copy.caseFields.coverage)).toHaveValue('requested');
    expect(screen.getByLabelText(copy.caseFields.caseFollowUpUtc)).toHaveValue('2026-01-02T12:30');
    set(copy.caseFields.insurance, 'Retried reference');
    submit(copy.caseFields.save);
    expect(await screen.findByText(copy.feedback.saved)).toBeVisible();
    expect(action.fields).toHaveBeenNthCalledWith(2, {
      claimId,
      ...winning,
      insuranceProofReference: 'Retried reference',
      expected: winning,
    });
  });
});

describe('authorizations', () => {
  it('requires a jurisdiction confirmation and records only the checkbox literal', async () => {
    show(
      <ClaimAuthoritiesPanel
        claimId={claimId}
        canWrite
        authorities={[]}
        documents={[...documents, { id: ' doc-a ', name: 'Different instrument.pdf' }]}
      />
    );
    expect(screen.getByText(copy.authorities.empty)).toBeVisible();
    set(copy.authorities.kind, 'power_of_attorney');
    set(copy.authorities.instrument, ' doc-a ');
    set(copy.authorities.version, 'v1');
    set(copy.authorities.grantedUtc, '2026-01-02T12:30');
    set(copy.authorities.jurisdiction, 'de');
    submit(copy.authorities.record);
    expect(action.record).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: copy.authorities.attestJurisdiction }));
    submit(copy.authorities.record);
    expect(await screen.findByText(copy.feedback.saved)).toBeVisible();
    expect(action.record).toHaveBeenCalledExactlyOnceWith({
      claimId,
      kind: 'power_of_attorney',
      evidenceDocumentId: ' doc-a ',
      version: 'v1',
      grantedAt: occurredAt,
      expiresAt: null,
      jurisdictionCountryCode: 'DE',
      jurisdictionAppropriateConfirmed: true,
      purpose: undefined,
      correlationId: expect.any(String),
    });
  });

  it('records a consent purpose and requires explicit confirmation to revoke', async () => {
    show(
      <ClaimAuthoritiesPanel
        claimId={claimId}
        canWrite
        authorities={[recovery]}
        documents={documents}
      />
    );
    set(copy.authorities.kind, 'consent_or_lawful_basis');
    set(copy.authorities.instrument, 'doc-a');
    set(copy.authorities.version, 'v2');
    set(copy.authorities.grantedUtc, '2026-01-02T12:30');
    set(copy.authorities.purpose, 'Sharing purpose');
    submit(copy.authorities.record);
    expect(await screen.findByText(copy.feedback.saved)).toBeVisible();
    expect(action.record).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'Sharing purpose' })
    );
    const revoke = screen.getByText(copy.authorities.revoke);
    expect(revoke.closest('details')).not.toHaveAttribute('open');
    expect(action.revoke).not.toHaveBeenCalled();
    fireEvent.click(revoke);
    expect(revoke.closest('details')).toHaveAttribute('open');
    expect(screen.getByText(copy.authorities.revokeLimit)).toBeVisible();
    submit(copy.authorities.confirmRevoke);
    expect(action.revoke).toHaveBeenCalledExactlyOnceWith({ claimId, authorityId: recovery.id });
    expect(await within(revoke.closest('li')!).findByText(copy.feedback.saved)).toBeVisible();
  });
});
