import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  assertNoTenantLeak: vi.fn(),
  getClaimsListQuery: vi.fn(),
}));

vi.mock('./tenant-leak', () => ({
  assertNoTenantLeak: hoisted.assertNoTenantLeak,
}));

vi.mock('./claims/queries', () => ({
  getClaimsListQuery: hoisted.getClaimsListQuery,
}));

import { getTenantSafeClaimsListQuery } from './claims/list-query';

const serverDomainsDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(serverDomainsDir, '../..');

function readSource(relativePath: string): string {
  return readFileSync(path.join(serverDomainsDir, relativePath), 'utf8');
}

function listTypeScriptFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.ts') ? [fullPath] : [];
  });
}

describe('tenant leak guard adoption', () => {
  it('asserts query rows against the expected tenant', async () => {
    const rows = [{ claim: { id: 'shared-claim-id', tenantId: 'tenant-b' } }];
    hoisted.getClaimsListQuery.mockResolvedValue({
      rows,
      facets: { active: 0, draft: 0, closed: 0, total: 1 },
    });

    await getTenantSafeClaimsListQuery(
      {
        tenantId: 'tenant-b',
        role: 'admin',
        branchId: null,
        userId: 'user-1',
      },
      'tenant-a'
    );

    expect(hoisted.getClaimsListQuery).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-b' })
    );
    expect(hoisted.assertNoTenantLeak).toHaveBeenCalledWith(rows, 'tenant-a');
  });

  it('routes the claims list query through the reusable assertion', () => {
    const wrapper = readSource('claims/list-query.ts');
    const publicEntry = readSource('claims/index.ts');

    expect(wrapper).toContain('getClaimsListQuery(filters)');
    expect(wrapper).toContain('assertNoTenantLeak(result.rows, expectedTenantId)');
    expect(publicEntry).toContain('getTenantSafeClaimsListQuery(');
    expect(publicEntry).toContain('accessConfig.tenantId');
    expect(publicEntry).not.toContain('getClaimsListQuery(filters)');
  });

  it('keeps the raw claims list query behind the guarded wrapper', () => {
    const allowedRawQueryFiles = new Set([
      path.join(serverDomainsDir, 'claims/list-query.ts'),
      path.join(serverDomainsDir, 'claims/queries.ts'),
    ]);

    const directUsers = listTypeScriptFiles(srcDir)
      .filter(file => !file.endsWith('.test.ts'))
      .filter(file => !allowedRawQueryFiles.has(file))
      .filter(file => readFileSync(file, 'utf8').includes('getClaimsListQuery'));

    expect(directUsers).toEqual([]);
  });
});
