// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import {
  authOperationPrefix,
  discoverAuthOperations,
} from './member-acceptance-auth-inventory.test-support';
import entries from './member-acceptance-entries.json';
import {
  validateEntry,
  validateEntryCoverage,
  type Registry,
} from './member-acceptance-entry-rules.test-support';
import { loadInventory } from './member-acceptance-inventory.test-support';

import { verifyInformationRequestCallSites } from './member-acceptance-page-readers.test-support';

const registry: Registry = entries;
const scanTimeout = 60_000;

describe('member acceptance inventory', () => {
  let inventory: ReturnType<typeof loadInventory>;

  // Build the TypeScript program in setup so it has its own timeout under worker load.
  beforeAll(() => {
    inventory = loadInventory();
  }, scanTimeout);

  it(
    'has an explicit disposition with current evidence for every discovered entry',
    () => {
      const authOperations = discoverAuthOperations();
      verifyInformationRequestCallSites(inventory);
      validateEntryCoverage([...inventory.units.map(unit => unit.id), ...authOperations], registry);
      for (const unit of inventory.units) validateEntry(inventory, unit, registry[unit.id]);
      for (const id of authOperations) {
        const row = registry[id];
        expect(row.disposition, id).toBe('exempt');
        expect(row.reason?.trim(), id).toBeTruthy();
        expect(row.evidence, id).toMatch(/^apps\/web\/src\/lib\/auth\/.+:\d+$/u);
      }
      expect(authOperations).toContain(`${authOperationPrefix}POST /update-user`);
    },
    scanTimeout
  );
});
