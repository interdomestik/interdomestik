import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importMembersCore } from './import-members.core';

const mocks = vi.hoisted(() => ({
  registerMemberCore: vi.fn(),
}));

function buildImportRow(
  overrides: Partial<{
    fullName: string;
    email: string;
    phone: string;
    planId: 'standard' | 'family';
  }> = {}
) {
  return {
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+38344111222',
    planId: 'standard' as const,
    ...overrides,
  };
}

vi.mock('./register-member.core', () => ({
  registerMemberCore: mocks.registerMemberCore,
}));

describe('importMembersCore', () => {
  const agent = { id: 'agent-1', name: 'Agent Smith' };
  const authority = mintTestTenantAuthority('tenant-1');
  const branchId = 'branch-1';

  beforeEach(() => {
    mocks.registerMemberCore.mockReset();
  });

  it('imports valid rows and reports row-level failures without aborting the batch', async () => {
    mocks.registerMemberCore.mockResolvedValueOnce({ ok: true });

    const result = await importMembersCore({
      agent,
      authority,
      branchId,
      rows: [
        buildImportRow(),
        buildImportRow({
          fullName: 'Bad Email',
          email: 'not-an-email',
          phone: '+38344111223',
        }),
      ],
    });

    expect(result.summary).toEqual({
      total: 2,
      imported: 1,
      failed: 1,
    });
    expect(result.results).toEqual([
      {
        index: 0,
        email: 'jane@example.com',
        fullName: 'Jane Doe',
        ok: true,
      },
      {
        index: 1,
        email: 'not-an-email',
        fullName: 'Bad Email',
        ok: false,
        error: 'Validation failed',
      },
    ]);
  });

  it('rejects an empty batch before calling member registration', async () => {
    const result = await importMembersCore({
      agent,
      authority,
      branchId,
      rows: [],
    });

    expect(result).toEqual({
      summary: {
        total: 0,
        imported: 0,
        failed: 0,
      },
      results: [],
      error: 'No rows to import',
    });
    expect(mocks.registerMemberCore).not.toHaveBeenCalled();
  });

  it('stops at the first closed row and preserves the earlier registration result', async () => {
    mocks.registerMemberCore
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, code: 'CLOSED' });

    const result = await importMembersCore({
      agent,
      authority,
      branchId,
      rows: [
        buildImportRow({ email: 'first@example.com' }),
        buildImportRow({ email: 'closed@example.com' }),
        buildImportRow({ email: 'unattempted@example.com' }),
      ],
    });

    expect(result).toEqual({
      code: 'CLOSED',
      summary: { total: 3, imported: 1, failed: 1 },
      results: [
        { index: 0, email: 'first@example.com', fullName: 'Jane Doe', ok: true },
        {
          index: 1,
          email: 'closed@example.com',
          fullName: 'Jane Doe',
          ok: false,
          code: 'CLOSED',
        },
      ],
    });
    expect(mocks.registerMemberCore).toHaveBeenCalledTimes(2);
  });

  it('creates sponsored seats through the sponsored registration mode', async () => {
    mocks.registerMemberCore.mockResolvedValue({ ok: true });

    await importMembersCore({
      agent,
      authority,
      branchId,
      rows: [buildImportRow()],
    });

    expect(mocks.registerMemberCore).toHaveBeenCalledWith(
      agent,
      authority,
      branchId,
      expect.any(FormData),
      { membershipMode: 'sponsored' }
    );
    const formData = mocks.registerMemberCore.mock.calls[0]?.[3] as FormData;
    expect(formData.has('password')).toBe(false);
  });
});
