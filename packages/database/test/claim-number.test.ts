import assert from 'node:assert/strict';
import test from 'node:test';

import { generateClaimNumber } from '../src/claim-number';

function createSelectChain(responses: unknown[]) {
  const query = {
    from() {
      return query;
    },
    where() {
      return query;
    },
    orderBy() {
      return query;
    },
    limit() {
      const response = responses.shift();
      if (!response) {
        throw new Error('Unexpected select() call in claim-number test');
      }

      return Promise.resolve(response);
    },
  };

  return query;
}

test('generateClaimNumber seeds from the latest existing claim number when counters are missing', async () => {
  const selectResponses: unknown[] = [
    [{ claimNumber: null }],
    [{ code: 'MK' }],
    [{ claimNumber: 'CLM-MK-2026-000001' }],
  ];
  let insertedCounterValues:
    | {
        tenantId: string;
        year: number;
        lastNumber: number;
      }
    | undefined;

  const tx = {
    select() {
      return createSelectChain(selectResponses);
    },
    insert() {
      return {
        values(values: { tenantId: string; year: number; lastNumber: number }) {
          insertedCounterValues = values;

          return {
            onConflictDoUpdate() {
              return {
                returning() {
                  return Promise.resolve([{ lastNumber: values.lastNumber }]);
                },
              };
            },
          };
        },
      };
    },
    update() {
      return {
        set() {
          return {
            where() {
              return {
                returning() {
                  return Promise.resolve([{ id: 'claim-new' }]);
                },
              };
            },
          };
        },
      };
    },
  } as any;

  const claimNumber = await generateClaimNumber(tx, {
    tenantId: 'tenant_mk',
    claimId: 'claim-new',
    createdAt: new Date('2026-04-09T00:00:00.000Z'),
  });

  assert.equal(claimNumber, 'CLM-MK-2026-000002');
  assert.deepEqual(insertedCounterValues, {
    tenantId: 'tenant_mk',
    year: 2026,
    lastNumber: 2,
  });
});
