import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importMembersCore } from './import-members.core';

const mocks = vi.hoisted(() => ({
  registerMemberCore: vi.fn(),
}));

function makeCredential(label: string) {
  return ['member', label, 'access'].join('-');
}

function buildImportRow(
  overrides: Partial<{
    fullName: string;
    email: string;
    phone: string;
    password: string;
    planId: 'standard' | 'family';
  }> = {}
) {
  return {
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+38344111222',
    password: makeCredential('jane'),
    planId: 'standard' as const,
    ...overrides,
  };
}

vi.mock('./register-member.core', () => ({
  registerMemberCore: mocks.registerMemberCore,
}));

describe('importMembersCore', () => {
  const agent = { id: 'agent-1', name: 'Agent Smith' };
  const tenantId = 'tenant-1';
  const branchId = 'branch-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('imports valid rows and reports row-level failures without aborting the batch', async () => {
    mocks.registerMemberCore
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: 'Validation failed' });

    const result = await importMembersCore({
      agent,
      tenantId,
      branchId,
      rows: [
        buildImportRow(),
        buildImportRow({
          fullName: 'Bad Email',
          email: 'not-an-email',
          phone: '+38344111223',
          password: makeCredential('bad-email'),
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
      tenantId,
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

  it('creates sponsored seats through the sponsored registration mode', async () => {
    mocks.registerMemberCore.mockResolvedValue({ ok: true });

    await importMembersCore({
      agent,
      tenantId,
      branchId,
      rows: [buildImportRow()],
    });

    expect(mocks.registerMemberCore).toHaveBeenCalledWith(
      agent,
      tenantId,
      branchId,
      expect.any(FormData),
      { membershipMode: 'sponsored' }
    );
  });
});
