import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ANONYMOUS_DRAFT_KEY } from './free-start-intake-shell/anonymous-draft-recovery';
// The harness registers every seam, so it must be imported before the runtime graph below.
// prettier-ignore
import { ACCOUNT_CONTEXT, ACKNOWLEDGED, ANONYMOUS_PENDING, ANONYMOUS_SETTLED, AUTH_REQUIRED, CONTINUATION_HREF, OWNER_A, OWNER_B, SIGN_IN_OK, VEHICLE_FACTS, VERIFIED_EMAIL, continuation, continuityBoundary, createCalls, deferred, enableDeviceRecovery, expectSaveState, heroCopy, openSecureSave, organizerNode, pendingRefresh, prepareVehicleReport, publishSession, reportedFacts, requestCode, resetContinuityBoundary, saveStatus, saveWithVerifiedEmail, secureSaveReviewCopy, settleHeld, settledOwner, submitCode, type SessionSnapshot, type SessionUser } from '@/test/free-start-verified-continuity-harness';

import { HomePageRuntime } from './home-page-runtime';

const h = continuityBoundary();

// prettier-ignore
const renderPublicHome = () => render(<HomePageRuntime defaultPublicTenantId="tenant_ks" locale="en" neutralOtpHost={location.host} uiV2Enabled />);

describe('mounted verified-save continuity across session publication', () => {
  beforeEach(resetContinuityBoundary);

  it('C11 keeps the report and the held save when the verified identity publishes', async () => {
    const accepted = deferred<typeof ACKNOWLEDGED>();
    h.create.mockResolvedValueOnce(AUTH_REQUIRED).mockReturnValueOnce(accepted.promise);
    renderPublicHome();
    await publishSession(h, ANONYMOUS_SETTLED);
    await saveWithVerifiedEmail();
    const organizer = organizerNode();
    await expectSaveState('saving');

    // The identity the customer just verified is published while the required save is still held.
    await publishSession(h, settledOwner(OWNER_A));
    expect(organizerNode()).toBe(organizer);
    expect(reportedFacts()).not.toBeNull();
    expect(saveStatus()).toHaveAttribute('data-state', 'saving');
    expect(continuation()).toBeNull();

    await settleHeld(accepted, ACKNOWLEDGED);
    await expectSaveState('saved');
    expect(organizerNode()).toBe(organizer);
    expect(reportedFacts()).not.toBeNull();
    expect(continuation()).toHaveAttribute('href', CONTINUATION_HREF);
    const [first, second] = createCalls();
    expect(h.create).toHaveBeenCalledTimes(2);
    expect(second.clientRequestId).toBe(first.clientRequestId);
    expect(second).toMatchObject({ category: 'vehicle', resumeStep: 'preview', ...VEHICLE_FACTS });
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.signIn).toHaveBeenCalledTimes(1);
    // prettier-ignore
    expect(h.signIn).toHaveBeenCalledWith(expect.objectContaining({ email: VERIFIED_EMAIL, otp: '123456' }));
    expect(h.submit).not.toHaveBeenCalled();
    expect(h.pack).not.toHaveBeenCalled();
    expect(localStorage).toHaveLength(0);
  });

  it('C11 keeps the acknowledged receipt when the same identity publishes afterwards', async () => {
    h.create.mockResolvedValueOnce(AUTH_REQUIRED).mockResolvedValueOnce(ACKNOWLEDGED);
    renderPublicHome();
    await publishSession(h, ANONYMOUS_SETTLED);
    await saveWithVerifiedEmail();
    await expectSaveState('saved');
    const organizer = organizerNode();
    expect(continuation()).toHaveAttribute('href', CONTINUATION_HREF);

    await publishSession(h, settledOwner(OWNER_A));
    expect(organizerNode()).toBe(organizer);
    expect(continuation()).toHaveAttribute('href', CONTINUATION_HREF);
    expect(saveStatus()).toHaveAttribute('data-state', 'saved');
    expect(reportedFacts()).not.toBeNull();

    // A refresh that reports no data yet must not retract the receipt the owner already holds.
    await publishSession(h, ANONYMOUS_PENDING);
    expect(organizerNode()).toBe(organizer);
    expect(continuation()).toHaveAttribute('href', CONTINUATION_HREF);
    expect(saveStatus()).toHaveAttribute('data-state', 'saved');
    expect(h.create).toHaveBeenCalledTimes(2);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.submit).not.toHaveBeenCalled();
    expect(localStorage).toHaveLength(0);
  });

  it('C11 reports a held save failure truthfully and retries the same request', async () => {
    const rejected = deferred<typeof ACCOUNT_CONTEXT>();
    h.create
      .mockResolvedValueOnce(AUTH_REQUIRED)
      .mockReturnValueOnce(rejected.promise)
      .mockResolvedValueOnce(ACKNOWLEDGED);
    renderPublicHome();
    await publishSession(h, ANONYMOUS_SETTLED);
    await saveWithVerifiedEmail();
    const organizer = organizerNode();
    await expectSaveState('saving');
    await publishSession(h, settledOwner(OWNER_A));
    expect(organizerNode()).toBe(organizer);

    await settleHeld(rejected, ACCOUNT_CONTEXT);
    await expectSaveState('accountContext');
    expect(saveStatus()).toHaveTextContent(secureSaveReviewCopy.accountContext);
    expect(continuation()).toBeNull();
    expect(reportedFacts()).not.toBeNull();

    // The already verified customer retries the save itself; no further code is sent or consumed.
    fireEvent.click(screen.getByTestId('free-start-save-open'));
    await expectSaveState('saved');
    expect(organizerNode()).toBe(organizer);
    expect(continuation()).toHaveAttribute('href', CONTINUATION_HREF);
    expect(h.create).toHaveBeenCalledTimes(3);
    expect(new Set(createCalls().map(call => call.clientRequestId)).size).toBe(1);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.signIn).toHaveBeenCalledTimes(1);
    expect(h.submit).not.toHaveBeenCalled();
    expect(localStorage).toHaveLength(0);
  });

  it('C11 saves nothing automatically for ordinary session movement', async () => {
    renderPublicHome();
    await prepareVehicleReport();
    const organizer = organizerNode();
    expect(screen.getByTestId('public-entry-situations')).toHaveTextContent(heroCopy.vehicle);
    // Only a confirmed logout is a logout; a refresh reporting no data yet is not one.
    for (const snapshot of [
      ANONYMOUS_SETTLED,
      settledOwner(OWNER_A),
      ANONYMOUS_PENDING,
      settledOwner(OWNER_A),
      pendingRefresh(OWNER_A),
      settledOwner({ ...OWNER_A }),
    ]) {
      await publishSession(h, snapshot);
      expect(organizerNode()).toBe(organizer);
      expect(reportedFacts()).not.toBeNull();
      expect(continuation()).toBeNull();
    }
    expect(h.create).not.toHaveBeenCalled();
    expect(h.list).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
    expect(h.signIn).not.toHaveBeenCalled();
    expect(h.submit).not.toHaveBeenCalled();
    expect(h.replace).not.toHaveBeenCalled();
    expect(localStorage).toHaveLength(0);
  });

  it('C11 opens an authenticated arrival with no receipt and no automatic save', async () => {
    h.set(settledOwner(OWNER_A));
    renderPublicHome();
    await prepareVehicleReport();
    // Preparing the report reaches neither the server nor the identity boundary on its own.
    expect(h.create).not.toHaveBeenCalled();
    expect(h.list).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
    expect(h.signIn).not.toHaveBeenCalled();
    expect(h.submit).not.toHaveBeenCalled();
    expect(continuation()).toBeNull();
    expect(screen.getByTestId('public-entry-hero')).toHaveTextContent(heroCopy.memberTitle);

    await openSecureSave();
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(createCalls()[0]).toMatchObject({ category: 'vehicle', resumeStep: 'preview' });
    expect(h.send).not.toHaveBeenCalled();
    expect(h.signIn).not.toHaveBeenCalled();
    expect(h.submit).not.toHaveBeenCalled();
    expect(localStorage).toHaveLength(0);
  });

  it.each([
    ['the owner logs out', true, ANONYMOUS_SETTLED],
    ['another account takes over', true, settledOwner(OWNER_B)],
    ['the owner tenant changes', true, settledOwner({ ...OWNER_A, tenantId: 'tenant_mk' })],
    ['another account settles first after the acknowledgment', false, settledOwner(OWNER_B)],
  ] as [string, boolean, SessionSnapshot][])(
    'C11 resets the receipt and the facts when %s',
    async (_label, publishesOwner, next) => {
      h.create.mockResolvedValueOnce(AUTH_REQUIRED).mockResolvedValueOnce(ACKNOWLEDGED);
      renderPublicHome();
      await publishSession(h, ANONYMOUS_SETTLED);
      await saveWithVerifiedEmail();
      if (publishesOwner) await publishSession(h, settledOwner(OWNER_A));
      await expectSaveState('saved');
      const organizer = organizerNode();

      await publishSession(h, next);
      expect(organizerNode()).not.toBe(organizer);
      expect(reportedFacts()).toBeNull();
      expect(continuation()).toBeNull();
      expect(screen.queryByText(VEHICLE_FACTS.counterparty)).toBeNull();
      await expectSaveState('idle');
      expect(h.create).toHaveBeenCalledTimes(2);
      expect(h.list).not.toHaveBeenCalled();
      expect(localStorage).toHaveLength(0);
    }
  );

  it('C11 keeps a held save for the previous owner out of the new owner UI', async () => {
    const accepted = deferred<typeof ACKNOWLEDGED>();
    h.create.mockResolvedValueOnce(AUTH_REQUIRED).mockReturnValueOnce(accepted.promise);
    renderPublicHome();
    await publishSession(h, ANONYMOUS_SETTLED);
    await saveWithVerifiedEmail();
    await publishSession(h, settledOwner(OWNER_A));
    await expectSaveState('saving');

    await publishSession(h, settledOwner(OWNER_B));
    await settleHeld(accepted, ACKNOWLEDGED);
    expect(continuation()).toBeNull();
    expect(reportedFacts()).toBeNull();
    expect(screen.queryByText(VEHICLE_FACTS.counterparty)).toBeNull();
    await expectSaveState('idle');
    expect(h.create).toHaveBeenCalledTimes(2);
    expect(localStorage).toHaveLength(0);
  });

  it('C11 keeps an acknowledgment for one owner out of the first settled owner', async () => {
    const accepted = deferred<typeof ACKNOWLEDGED>();
    h.create.mockResolvedValueOnce(AUTH_REQUIRED).mockReturnValueOnce(accepted.promise);
    renderPublicHome();
    await publishSession(h, ANONYMOUS_SETTLED);
    // Owner A verifies the save here, but their session is never published to this page.
    await saveWithVerifiedEmail();
    await expectSaveState('saving');

    // Owner B is the first settled identity this page ever sees, and the save is still held.
    await publishSession(h, settledOwner(OWNER_B));
    expect(screen.getByTestId('public-entry-hero')).toHaveTextContent(heroCopy.memberTitle);

    // Owner A's acknowledgment lands after owner B already owns the page.
    await settleHeld(accepted, ACKNOWLEDGED);
    expect(continuation()).toBeNull();
    expect(screen.queryByTestId('saved-draft-continuation')).toBeNull();
    expect(saveStatus()).not.toHaveAttribute('data-state', 'saved');
    expect(reportedFacts()).toBeNull();
    expect(h.create).toHaveBeenCalledTimes(2);
    expect(new Set(createCalls().map(call => call.clientRequestId)).size).toBe(1);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.list).not.toHaveBeenCalled();
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.signIn).toHaveBeenCalledTimes(1);
    expect(h.submit).not.toHaveBeenCalled();
    expect(h.pack).not.toHaveBeenCalled();
    expect(localStorage).toHaveLength(0);
  });

  it.each([
    ['a known owner is replaced while the code verifies', [OWNER_A, OWNER_B]],
    ['another owner settles first while the code verifies', [OWNER_B]],
  ] as [string, SessionUser[]][])(
    'C11 refuses a verification that completes after %s',
    async (_label, owners) => {
      const verifying = deferred<typeof SIGN_IN_OK>();
      h.signIn.mockReturnValueOnce(verifying.promise);
      renderPublicHome();
      await publishSession(h, ANONYMOUS_SETTLED);
      await saveWithVerifiedEmail();
      for (const owner of owners) await publishSession(h, settledOwner(owner));

      // The verification only now returns owner A, who no longer owns this page.
      await settleHeld(verifying, SIGN_IN_OK);
      // Only the optional pre-verification probe may ever have reached the server.
      expect(h.create).toHaveBeenCalledTimes(1);
      expect(createCalls()[0]).toMatchObject({ category: 'vehicle', resumeStep: 'preview' });
      expect(continuation()).toBeNull();
      expect(reportedFacts()).toBeNull();
      expect(screen.queryByText(VEHICLE_FACTS.counterparty)).toBeNull();
      expect(h.send).toHaveBeenCalledTimes(1);
      expect(h.signIn).toHaveBeenCalledTimes(1);
      expect(h.update).not.toHaveBeenCalled();
      expect(h.submit).not.toHaveBeenCalled();
      expect(localStorage).toHaveLength(0);
    }
  );

  it.each([
    ['clears the opted-in device copy on the matching acknowledgment', ACKNOWLEDGED, true],
    ['retains the opted-in device copy when the save is rejected', ACCOUNT_CONTEXT, false],
  ] as [string, unknown, boolean][])('C11 %s', async (_label, answer, cleared) => {
    const held = deferred<unknown>();
    h.create.mockResolvedValueOnce(AUTH_REQUIRED).mockReturnValueOnce(held.promise);
    renderPublicHome();
    await publishSession(h, ANONYMOUS_SETTLED);
    await enableDeviceRecovery();
    await prepareVehicleReport();
    await waitFor(() => expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).not.toBeNull());
    expect(organizerNode()).toHaveAttribute('data-save-behavior', 'device-recovery');
    await openSecureSave();
    await requestCode();
    await submitCode();
    await expectSaveState('saving');

    await publishSession(h, settledOwner(OWNER_A));
    // Nothing local may be deleted before the server confirms this exact report.
    expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).not.toBeNull();
    await settleHeld(held, answer);
    await expectSaveState(cleared ? 'saved' : 'accountContext');
    if (cleared) {
      await waitFor(() => expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull());
    } else {
      expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).not.toBeNull();
      expect(continuation()).toBeNull();
    }
    expect(reportedFacts()).not.toBeNull();
    expect(h.create).toHaveBeenCalledTimes(2);
    expect(h.submit).not.toHaveBeenCalled();
  });
});
