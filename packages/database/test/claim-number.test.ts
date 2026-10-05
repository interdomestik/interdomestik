import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { generateClaimNumber } from '../src/claim-number';

type ClaimNumberRow = { claimNumber: string | null };

type TxFixture = {
  existingRows?: ClaimNumberRow[];
  latestRows?: ClaimNumberRow[];
  recheckRows?: ClaimNumberRow[];
  tenantRows?: { code: string | null }[];
  counterRows?: { lastNumber: number }[];
  updatedRows?: { id: string }[];
};

function createTx(fixture: TxFixture) {
  const calls: string[] = [];
  const counterValues: Array<{ tenantId: string; year: number; lastNumber: number }> = [];
  let claimsSelects = 0;

  const tx = {
    select(projection: Record<string, unknown>) {
      if ('code' in projection) {
        calls.push('select:tenants');
        return { from: () => ({ where: () => ({ limit: async () => fixture.tenantRows ?? [] }) }) };
      }

      claimsSelects += 1;
      const nth = claimsSelects;
      calls.push(`select:claims:${nth}`);
      return {
        from: () => ({
          where: () => ({
            limit: async () =>
              nth === 1 ? (fixture.existingRows ?? []) : (fixture.recheckRows ?? []),
            orderBy: () => ({ limit: async () => fixture.latestRows ?? [] }),
          }),
        }),
      };
    },
    insert() {
      calls.push('insert:counter');
      return {
        values: (values: { tenantId: string; year: number; lastNumber: number }) => ({
          onConflictDoUpdate: () => ({
            returning: async () => {
              counterValues.push(values);
              return fixture.counterRows ?? [{ lastNumber: values.lastNumber }];
            },
          }),
        }),
      };
    },
    update() {
      calls.push('update:claim');
      return {
        set: () => ({ where: () => ({ returning: async () => fixture.updatedRows ?? [] }) }),
      };
    },
  };

  // The production signature is the full Drizzle transaction; this focused stub
  // only implements the statements the generator is allowed to run.
  return { calls, counterValues, tx: tx as unknown as Parameters<typeof generateClaimNumber>[0] };
}

const params = {
  tenantId: 'tenant_ks',
  claimId: 'claim-1',
  createdAt: new Date('2026-06-15T12:00:00.000Z'),
};

const numberedFixture: TxFixture = {
  existingRows: [],
  latestRows: [],
  recheckRows: [],
  counterRows: [{ lastNumber: 7 }],
  updatedRows: [{ id: 'claim-1' }],
};

describe('generateClaimNumber trusted tenant metadata', () => {
  it('seeds a missing counter above the latest existing claim number', async () => {
    const { counterValues, tx } = createTx({
      existingRows: [{ claimNumber: null }],
      latestRows: [{ claimNumber: 'CLM-KS-2026-000001' }],
      updatedRows: [{ id: 'claim-1' }],
    });

    const claimNumber = await generateClaimNumber(tx, params, {
      tenantId: 'tenant_ks',
      code: 'KS',
    });

    assert.equal(claimNumber, 'CLM-KS-2026-000002');
    assert.deepEqual(counterValues, [{ tenantId: 'tenant_ks', year: 2026, lastNumber: 2 }]);
  });

  it('uses server-prepared metadata instead of a tenant read inside the transaction', async () => {
    const { calls, tx } = createTx(numberedFixture);

    const claimNumber = await generateClaimNumber(tx, params, {
      tenantId: 'tenant_ks',
      code: 'KS',
    });

    assert.equal(claimNumber, 'CLM-KS-2026-000007');
    assert.equal(calls.includes('select:tenants'), false);
    assert.deepEqual(calls, [
      'select:claims:1',
      'select:claims:2',
      'insert:counter',
      'update:claim',
    ]);
  });

  it('fails closed before the counter when metadata is pinned to another tenant', async () => {
    const { calls, tx } = createTx(numberedFixture);

    await assert.rejects(
      generateClaimNumber(tx, params, { tenantId: 'tenant_mk', code: 'MK' }),
      /Tenant code not found for tenantId: tenant_ks/
    );
    assert.equal(calls.includes('insert:counter'), false);
    assert.equal(calls.includes('update:claim'), false);
    assert.equal(calls.includes('select:tenants'), false);
  });

  it('fails closed before the counter when the prepared code is blank', async () => {
    const { calls, tx } = createTx(numberedFixture);

    await assert.rejects(
      generateClaimNumber(tx, params, { tenantId: 'tenant_ks', code: '  ' }),
      /Tenant code not found for tenantId: tenant_ks/
    );
    assert.equal(calls.includes('insert:counter'), false);
  });

  it('keeps the in-transaction tenant read for callers without prepared metadata', async () => {
    const { calls, tx } = createTx({ ...numberedFixture, tenantRows: [{ code: 'KS' }] });

    const claimNumber = await generateClaimNumber(tx, params);

    assert.equal(claimNumber, 'CLM-KS-2026-000007');
    assert.deepEqual(calls, [
      'select:claims:1',
      'select:tenants',
      'select:claims:2',
      'insert:counter',
      'update:claim',
    ]);
  });

  it('returns the immutable existing number before any metadata resolution', async () => {
    const { calls, tx } = createTx({
      ...numberedFixture,
      existingRows: [{ claimNumber: 'CLM-KS-2026-000001' }],
    });

    const claimNumber = await generateClaimNumber(tx, params, {
      tenantId: 'tenant_ks',
      code: 'KS',
    });

    assert.equal(claimNumber, 'CLM-KS-2026-000001');
    assert.deepEqual(calls, ['select:claims:1']);
  });

  it('re-reads the winning number when the race-safe update matches no row', async () => {
    const { calls, tx } = createTx({
      ...numberedFixture,
      updatedRows: [],
      recheckRows: [{ claimNumber: 'CLM-KS-2026-000006' }],
    });

    const claimNumber = await generateClaimNumber(tx, params, {
      tenantId: 'tenant_ks',
      code: 'KS',
    });

    assert.equal(claimNumber, 'CLM-KS-2026-000006');
    assert.deepEqual(calls, [
      'select:claims:1',
      'select:claims:2',
      'insert:counter',
      'update:claim',
      'select:claims:3',
    ]);
  });
});
