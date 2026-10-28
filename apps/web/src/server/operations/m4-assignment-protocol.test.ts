import { describe, expect, it } from 'vitest';
import { parseM4AssignmentRequest } from './m4-assignment-protocol';

const request = {
  version: 1,
  command: 'm4.ops.assign-owner',
  operationId: '3ad84b57-6659-4c43-a278-199be055b683',
  claimId: 'claim-1',
  staffId: 'staff-1',
};

describe('closed M4 serialized assignment contract', () => {
  it('admits immutable fixed data and preserves profile-specific target semantics', () => {
    const parsed = parseM4AssignmentRequest(JSON.stringify(request));
    expect(parsed).toEqual(request);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(
      parseM4AssignmentRequest(JSON.stringify({ ...request, staffId: '  staff-1  ' }))?.staffId
    ).toBe('  staff-1  ');
    expect(
      parseM4AssignmentRequest(
        JSON.stringify({ ...request, command: 'm4.legacy.assign-claim', staffId: null })
      )?.staffId
    ).toBeNull();
    expect(
      parseM4AssignmentRequest(
        JSON.stringify({ ...request, command: 'm4.staff.assign-claim', staffId: undefined })
      )
    ).not.toHaveProperty('staffId');
  });
  it.each([
    'actorId',
    'actorRole',
    'tenantId',
    'session',
    'sql',
    'table',
    'callback',
    'module',
    'filters',
    '__proto__',
  ])('rejects caller-selected %s authority or execution fields', field => {
    expect(
      parseM4AssignmentRequest(JSON.stringify({ ...request, [field]: 'untrusted' }))
    ).toBeNull();
  });
  it('rejects live objects, arrays, invalid JSON, unsupported versions and commands', () => {
    for (const value of [
      request,
      [],
      null,
      'null',
      '[]',
      '{',
      JSON.stringify({ ...request, version: 2 }),
      JSON.stringify({ ...request, command: 'raw.sql' }),
    ])
      expect(parseM4AssignmentRequest(value)).toBeNull();
  });
  it('requires stable operation identity and bounded scalar resource/target identifiers', () => {
    for (const override of [
      { operationId: 'new-per-retry' },
      { claimId: '' },
      { claimId: 'x'.repeat(257) },
      { staffId: {} },
      { staffId: 'x\n' },
      { staffId: null },
      { staffId: undefined },
    ])
      expect(parseM4AssignmentRequest(JSON.stringify({ ...request, ...override }))).toBeNull();
    expect(parseM4AssignmentRequest(' '.repeat(8193) + JSON.stringify(request))).toBeNull();
    expect(
      parseM4AssignmentRequest(
        ' '.repeat(8000) + JSON.stringify({ ...request, claimId: '文'.repeat(256) })
      )
    ).toBeNull();
  });
  it('does not merge legacy missing target with staff default-to-self', () => {
    expect(
      parseM4AssignmentRequest(
        JSON.stringify({ ...request, command: 'm4.legacy.assign-claim', staffId: undefined })
      )
    ).toBeNull();
    expect(
      parseM4AssignmentRequest(
        JSON.stringify({ ...request, command: 'm4.staff.assign-claim', staffId: null })
      )?.staffId
    ).toBeNull();
  });
});
