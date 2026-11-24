import './agent.shared.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildImportRow,
  createRowsFormData,
  IMPORT_AGENT_SESSION,
  loadImportMembersAction,
} from './agent.test-support';
import { getAgentSession } from './agent/context';
import { revalidatePath } from 'next/cache';

vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));

describe('agent actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('importMembers', () => {
    it('returns unauthorized when bulk import runs without an agent session', async () => {
      const importMembers = await loadImportMembersAction();
      (getAgentSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(importMembers(null, createRowsFormData([]))).resolves.toEqual({
        error: 'Unauthorized',
        summary: undefined,
        results: undefined,
      });
    });

    it.each(['dark', 'not_office'])(
      'refuses the action itself when access is %s, before the payload or the core',
      async access => {
        const importMembers = await loadImportMembersAction();
        const { importMembersCore } = await import('./agent/import-members.core');
        const { resolveSponsoredImportAccess } = await import('./agent/sponsored-import-access');
        vi.mocked(getAgentSession).mockResolvedValue(IMPORT_AGENT_SESSION as never);
        vi.mocked(resolveSponsoredImportAccess).mockResolvedValueOnce(access as never);

        await expect(importMembers(null, createRowsFormData([buildImportRow()]))).resolves.toEqual({
          error: 'Unauthorized',
          summary: undefined,
          results: undefined,
        });
        expect(resolveSponsoredImportAccess).toHaveBeenCalledWith({
          agentId: 'agent1',
          authority: expect.anything(),
        });
        expect(importMembersCore).not.toHaveBeenCalled();
      }
    );

    it.each([
      [
        'no tenant authority',
        'Missing tenantId',
        async () => {
          const { getAgentAuthority } = await import('./agent/context');
          vi.mocked(getAgentAuthority).mockResolvedValueOnce(null);
        },
      ],
      [
        'denied access',
        'Unauthorized',
        async () => {
          const { resolveSponsoredImportAccess } = await import('./agent/sponsored-import-access');
          vi.mocked(resolveSponsoredImportAccess).mockResolvedValueOnce('dark');
        },
      ],
    ])('refuses on %s without reading the payload', async (_label, error, arrange) => {
      const importMembers = await loadImportMembersAction();
      vi.mocked(getAgentSession).mockResolvedValue(IMPORT_AGENT_SESSION as never);
      await arrange();
      const payload = createRowsFormData([buildImportRow()]);
      const read = vi.spyOn(payload, 'get').mockImplementation(() => {
        throw new Error('the payload was read before authorization');
      });

      await expect(importMembers(null, payload)).resolves.toEqual({
        error,
        summary: undefined,
        results: undefined,
      });
      expect(read).not.toHaveBeenCalled();
    });

    it('delegates bulk import to the core and returns the structured result', async () => {
      const importMembers = await loadImportMembersAction();
      const { importMembersCore } = await import('./agent/import-members.core');

      (getAgentSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        IMPORT_AGENT_SESSION
      );

      (importMembersCore as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        summary: { total: 1, imported: 1, failed: 0 },
        results: [{ index: 0, email: 'bulk@example.test', fullName: 'Bulk User', ok: true }],
      });

      await expect(
        importMembers(
          null,
          createRowsFormData([
            {
              ...buildImportRow(),
              fullName: 'Bulk User',
              email: 'bulk@example.test',
            },
          ])
        )
      ).resolves.toEqual({
        error: '',
        summary: { total: 1, imported: 1, failed: 0 },
        results: [{ index: 0, email: 'bulk@example.test', fullName: 'Bulk User', ok: true }],
      });
      expect(importMembersCore).toHaveBeenCalledWith(
        expect.objectContaining({ authority: expect.anything() })
      );
    });

    it.each([0, 1])('returns CLOSED after %i committed rows', async imported => {
      const importMembers = await loadImportMembersAction();
      const { importMembersCore } = await import('./agent/import-members.core');
      const { readTenantAuthority } = await import('@interdomestik/database/tenant-authority');
      vi.mocked(getAgentSession).mockResolvedValue(IMPORT_AGENT_SESSION as never);
      const { email, fullName, phone, planId } = buildImportRow();
      const row = { email, fullName, phone, planId };
      const stoppedRow = { ...row, email: 'closed@example.test', fullName: 'Closed Row' };
      const rows = imported ? [row, stoppedRow] : [stoppedRow];
      const results = [
        ...(imported ? [{ email, fullName, index: 0, ok: true }] : []),
        {
          index: imported,
          email: 'closed@example.test',
          fullName: 'Closed Row',
          ok: false,
          code: 'CLOSED' as const,
        },
      ];
      const summary = { total: imported + 1, imported, failed: 1 };
      vi.mocked(importMembersCore).mockResolvedValueOnce({ code: 'CLOSED', results, summary });
      const payload = createRowsFormData(rows.map(row => ({ ...row, tenantId: 'tenant-foreign' })));

      await expect(importMembers(null, payload)).resolves.toEqual({
        code: 'CLOSED',
        error: 'CLOSED',
        results,
        summary,
      });

      const parameters = vi.mocked(importMembersCore).mock.calls[0]?.[0];
      expect(parameters?.rows).toEqual(rows);
      expect(parameters && readTenantAuthority(parameters.authority).tenantId).toBe('tenant_mk');
      expect(revalidatePath).toHaveBeenCalledTimes(imported);
      if (imported) expect(revalidatePath).toHaveBeenCalledWith('/en/agent/clients');
    });

    it('rejects oversized batches before the import core is called', async () => {
      const importMembers = await loadImportMembersAction();
      const { importMembersCore } = await import('./agent/import-members.core');
      (getAgentSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        IMPORT_AGENT_SESSION
      );

      const rows = Array.from({ length: 201 }, (_, index) => buildImportRow(index));

      await expect(importMembers(null, createRowsFormData(rows))).resolves.toEqual({
        error: 'Validation failed',
        summary: undefined,
        results: undefined,
      });
      expect(importMembersCore).not.toHaveBeenCalled();
    });
  });
});
