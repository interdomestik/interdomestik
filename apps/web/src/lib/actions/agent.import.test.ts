import './agent.shared.test-support';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildImportRow,
  createRowsFormData,
  IMPORT_AGENT_SESSION,
  loadImportMembersAction,
} from './agent.test-support';
import { getAgentSession } from './agent/context';

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
