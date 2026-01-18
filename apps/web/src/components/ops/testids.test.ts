import { describe, expect, it } from 'vitest';
import { OPS_TEST_IDS } from './testids';

describe('OPS_TEST_IDS Contract', () => {
  it('should have required top-level keys', () => {
    expect(OPS_TEST_IDS.TABLE).toBeDefined();
    expect(OPS_TEST_IDS.DRAWER).toBeDefined();
    expect(OPS_TEST_IDS.TIMELINE).toBeDefined();
    expect(OPS_TEST_IDS.FILTERS).toBeDefined();
    expect(OPS_TEST_IDS.DOCUMENTS).toBeDefined();
  });

  it('should have correct TABLE keys', () => {
    expect(OPS_TEST_IDS.TABLE.ROOT).toBe('ops-table');
    expect(OPS_TEST_IDS.TABLE.LOADING).toBe('ops-table-loading');
    expect(OPS_TEST_IDS.TABLE.EMPTY).toBe('ops-table-empty');
    expect(OPS_TEST_IDS.TABLE.ROW).toBe('ops-table-row');
    expect(OPS_TEST_IDS.TABLE.ACTIONS).toBe('ops-table-actions');
  });

  it('should generate dynamic keys correctly', () => {
    expect(OPS_TEST_IDS.FILTERS.TAB('pending')).toBe('ops-tab-pending');
  });
});
