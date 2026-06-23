import { beforeEach, describe, expect, it, vi } from 'vitest';

import { lastEventPayload, mockTx, mocks, session } from './residence-country.test-helper';
import { updateResidenceCountryCore } from './residence-country';

describe('updateResidenceCountryCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated and malformed residence-country updates', async () => {
    await expect(
      updateResidenceCountryCore({ residenceCountry: 'AT', session: null })
    ).resolves.toEqual({
      success: false,
      error: 'Unauthorized',
    });

    await expect(
      updateResidenceCountryCore({ residenceCountry: 'Austria', session })
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Validation failed'),
    });

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('rejects direct residence-country updates from non-member actors', async () => {
    await expect(
      updateResidenceCountryCore({
        residenceCountry: 'AT',
        session: { user: { ...session.user, id: 'staff-1', role: 'staff' } },
      })
    ).resolves.toEqual({
      success: false,
      error: 'Forbidden',
    });

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('emits pending renewal evidence when recovery is inactive', async () => {
    const { updateSet } = mockTx({ activeRecoveryClaims: [], currentResidence: 'DE' });

    const result = await updateResidenceCountryCore(
      { residenceCountry: 'at', session },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toMatchObject({ success: true, eventId: 'event-1' });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ residenceCountry: 'AT', updatedAt: expect.any(Date) })
    );
    expect(mocks.appendEvent.mock.calls[0]?.[1]?.eventName).toBe(
      'member.residence_country_changed'
    );
    expect(lastEventPayload()).toMatchObject({
      activeRecoveryRunoff: false,
      changeState: 'pending_terms_reacceptance',
      migrationDecision: 'defer_to_renewal',
      termsAction: 'require_reacceptance_before_renewal',
    });
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'member.residence_country_changed', tenantId: 'tenant-1' })
    );
  });

  it('records run-off evidence and defers terms for active recovery members', async () => {
    mockTx({
      activeRecoveryClaims: [{ id: 'claim-1' }],
      currentResidence: 'DE',
      termsVersionAccepted: null,
    });

    await updateResidenceCountryCore({ residenceCountry: 'AT', session });

    expect(lastEventPayload()).toMatchObject({
      activeRecoveryClaimCount: 1,
      activeRecoveryRunoff: true,
      changeState: 'deferred_active_recovery_runoff',
      dsrDecision: 'legal_hold_run_off_until_recovery_terminal',
      migrationDecision: 'run_off_legacy_entity_until_recovery_terminal',
      termsAction: 'defer_reacceptance_until_recovery_terminal',
    });
  });

  it('returns unchanged without update, event, or audit side effects', async () => {
    const { tx } = mockTx({ currentResidence: 'AT' });

    const result = await updateResidenceCountryCore(
      { residenceCountry: 'AT', session },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toMatchObject({ success: true, eventId: null });
    expect(tx.update).not.toHaveBeenCalled();
    expect(mocks.appendEvent).not.toHaveBeenCalled();
    expect(mocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it('surfaces event failure as a failed transactional residence change', async () => {
    mockTx({ appendEventFails: true, currentResidence: 'DE' });

    await expect(updateResidenceCountryCore({ residenceCountry: 'AT', session })).resolves.toEqual({
      success: false,
      error: 'Failed to update residence country',
    });
  });

  it('keeps event evidence authoritative when the audit sink fails', async () => {
    mockTx({ activeRecoveryClaims: [], currentResidence: 'DE' });
    mocks.logAuditEvent.mockRejectedValueOnce(new Error('audit unavailable'));

    await expect(
      updateResidenceCountryCore(
        { residenceCountry: 'AT', session },
        { logAuditEvent: mocks.logAuditEvent }
      )
    ).resolves.toMatchObject({ success: true, eventId: 'event-1' });
    expect(mocks.appendEvent).toHaveBeenCalled();
  });
});
