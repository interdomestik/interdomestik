import { logAuditEvent } from '@/lib/audit';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import * as domainDraft from '@interdomestik/domain-claims/claims/draft';
import { revalidatePath } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateDraftClaimCore } from './draft.core';

vi.mock('@interdomestik/domain-claims/claims/draft', () => ({
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
  const authority = mintTestTenantAuthority('tenant-1');
  const mockHeaders = new Headers();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call domain updateDraftClaimCore', async () => {
    const data = { category: 'test' } as never;
    const params = {
      session: mockSession as never,
      authority,
      requestHeaders: mockHeaders,
      claimId: 'c1',
      data,
    };

    await updateDraftClaimCore(params);

    expect(domainDraft.updateDraftClaimCore).toHaveBeenCalledWith(params, {
      logAuditEvent,
      revalidatePath,
      validateSubmittedClaimFile: expect.any(Function),
    });
  });
});
