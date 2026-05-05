import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  acknowledgeDomainPublicResponse: vi.fn(),
  logAuditEvent: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@interdomestik/domain-claims/support-handoffs/acknowledgement', () => ({
  acknowledgeSupportHandoffPublicResponseCore: mocks.acknowledgeDomainPublicResponse,
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: mocks.logAuditEvent,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { acknowledgeSupportHandoffPublicResponseCore } from './acknowledgement.core';

const memberSession = {
  user: {
    id: 'member-1',
    role: 'member',
    tenantId: 'tenant-1',
  },
} as Parameters<typeof acknowledgeSupportHandoffPublicResponseCore>[0]['session'];

const successfulAcknowledgement = {
  data: {
    acknowledgedAt: '2026-05-05T09:00:00.000Z',
    handoffId: 'handoff-1',
    publicResponseAcknowledgedVersion: 2,
  },
  success: true,
} as const;

const staleAcknowledgement = {
  code: 'STALE_VERSION',
  error: 'The support team updated this response. Please review the latest update.',
  success: false,
} as const;

const closedAcknowledgement = {
  code: 'CLOSED',
  error: 'This support request is closed.',
  success: false,
} as const;

function acknowledgeWithHeaders(requestHeaders?: Headers) {
  return acknowledgeSupportHandoffPublicResponseCore({
    expectedPublicResponseVersion: 2,
    handoffId: 'handoff-1',
    requestHeaders,
    session: memberSession,
  });
}

function expectLocalizedRevalidation(locale: string) {
  expect(mocks.revalidatePath).toHaveBeenCalledTimes(2);
  expect(mocks.revalidatePath).toHaveBeenCalledWith(`/${locale}/member/help`);
  expect(mocks.revalidatePath).toHaveBeenCalledWith(`/${locale}/staff/support-handoffs`);
}

describe('acknowledgeSupportHandoffPublicResponseCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('revalidates localized member and staff support handoff paths after acknowledgement success', async () => {
    mocks.acknowledgeDomainPublicResponse.mockResolvedValueOnce(successfulAcknowledgement);

    const result = await acknowledgeWithHeaders(
      new Headers({ referer: 'https://ks.example.test/en/member/help' })
    );

    expect(result).toEqual(successfulAcknowledgement);
    expect(mocks.acknowledgeDomainPublicResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedPublicResponseVersion: 2,
        handoffId: 'handoff-1',
      }),
      { logAuditEvent: mocks.logAuditEvent }
    );
    expectLocalizedRevalidation('en');
  });

  it.each([
    [
      'stale acknowledgement',
      staleAcknowledgement,
      new Headers({ 'accept-language': 'sr,en;q=0.8' }),
      'sr',
    ],
    [
      'closed acknowledgement',
      closedAcknowledgement,
      new Headers({ referer: 'https://ks.example.test/mk/member/help' }),
      'mk',
    ],
  ])(
    'revalidates localized paths when a %s fails',
    async (_name, domainResult, headers, locale) => {
      mocks.acknowledgeDomainPublicResponse.mockResolvedValueOnce(domainResult);

      await expect(acknowledgeWithHeaders(headers)).resolves.toEqual(domainResult);
      expectLocalizedRevalidation(locale);
    }
  );

  it('does not revalidate paths when non-terminal acknowledgement fails', async () => {
    mocks.acknowledgeDomainPublicResponse.mockResolvedValueOnce({
      code: 'UNAUTHORIZED',
      error: 'Unauthorized',
      success: false,
    });

    const result = await acknowledgeSupportHandoffPublicResponseCore({
      expectedPublicResponseVersion: 1,
      handoffId: 'handoff-1',
      session: null,
    });

    expect(result).toEqual({
      code: 'UNAUTHORIZED',
      error: 'Unauthorized',
      success: false,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
