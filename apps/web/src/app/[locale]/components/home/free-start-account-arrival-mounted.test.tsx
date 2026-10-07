import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ACKNOWLEDGED,
  CONTINUATION_HREF,
  OWNER_A,
  continuation,
  continuityBoundary,
  expectSaveState,
  heroCopy,
  prepareVehicleReport,
  resetContinuityBoundary,
  settledOwner,
} from '@/test/free-start-verified-continuity-harness';
import { HomePageRuntime } from './home-page-runtime';
const h = continuityBoundary();
const renderPublicHome = () =>
  render(
    <HomePageRuntime
      defaultPublicTenantId="tenant_ks"
      locale="en"
      neutralOtpHost={location.host}
      uiV2Enabled
    />
  );
describe('verified account arrival', () => {
  beforeEach(resetContinuityBoundary);
  it('keeps an authenticated arrival blank until facts, then saves without OTP', async () => {
    h.set(settledOwner(OWNER_A));
    renderPublicHome();
    await waitFor(() => expect(h.list).toHaveBeenCalledOnce());
    expect(h.create).not.toHaveBeenCalled();
    h.create.mockResolvedValueOnce(ACKNOWLEDGED);
    h.update.mockImplementation(async input => ({
      ok: true,
      draft: { ...ACKNOWLEDGED.draft, ...input, version: input.expectedVersion + 1 },
    }));
    await prepareVehicleReport();
    await expectSaveState('saved');
    expect(h.create).toHaveBeenCalledOnce();
    expect(h.send).not.toHaveBeenCalled();
    expect(h.signIn).not.toHaveBeenCalled();
    expect(h.submit).not.toHaveBeenCalled();
    expect(continuation()).toHaveAttribute('href', CONTINUATION_HREF);
    expect(screen.getByTestId('public-entry-hero')).toHaveTextContent(heroCopy.memberTitle);

    expect(localStorage).toHaveLength(0);
  });
});
