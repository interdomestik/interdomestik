import { logAuditEvent } from '@/lib/audit';
import * as domainDraft from '@interdomestik/domain-claims/claims/draft';
import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelClaimCore, updateDraftClaimCore } from './draft.core';

vi.mock('@interdomestik/domain-claims/claims/draft', () => ({
  cancelClaimCore: vi.fn(),
  updateDraftClaimCore: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));

describe('claims draft.core', () => {
  const mockSession = { user: { id: 'u1' } };
  const mockHeaders = new Headers();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call domain updateDraftClaimCore', async () => {
    const data = { category: 'test' } as any;
    const params = {
      session: mockSession as any,
      requestHeaders: mockHeaders,
      claimId: 'c1',
      data,
    };

    await updateDraftClaimCore(params);

    expect(domainDraft.updateDraftClaimCore).toHaveBeenCalledWith(params, {
      logAuditEvent,
      revalidatePath,
    });
  });

  it('should call domain cancelClaimCore', async () => {
    const params = { session: mockSession as any, requestHeaders: mockHeaders, claimId: 'c1' };

    await cancelClaimCore(params);

    expect(domainDraft.cancelClaimCore).toHaveBeenCalledWith(params, {
      logAuditEvent,
      revalidatePath,
    });
  });
});
