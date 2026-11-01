// Immutable G-owned precision data; no candidate or report file supplies this contract.
const reviewed = {
  id: 'rc31-m4-assignment-closed-data-v1',
  files: [
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.ts',
      bytes: 2171,
      sha256: 'a45629d8d4210f517e126426caee992408e57355f94faf805ed358184c3b1e04',
      imports: [],
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      bytes: 4027,
      sha256: '2d6b81b7045048f4bf9944c545b9eea0e716a56b58e25f93ccc7e98fcc063e2a',
      imports: [
        {
          module: 'vitest',
          names: [
            ['describe', 'describe'],
            ['expect', 'expect'],
            ['it', 'it'],
          ],
        },
        {
          module: './m4-assignment-protocol',
          names: [['parseM4AssignmentRequest', 'parseM4AssignmentRequest']],
        },
      ],
    },
  ],
  diagnostics: [
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason: 'unsupported forwarded callback/value',
      occurrences: 294,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason: 'unsupported mutated or bounded handle argument to unresolved callee',
      occurrences: 591,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason: 'unsupported constructor executable edge',
      occurrences: 54,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason: 'mutated executable callee',
      occurrences: 84,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason: 'unsupported received property executable edge FIELDS.has',
      occurrences: 42,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason: 'unsupported received property executable edge Object.keys(row).some',
      occurrences: 42,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason: 'unsupported received property executable edge UUID.test',
      occurrences: 42,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason: 'unsupported received property executable edge expect(parsed).toEqual',
      occurrences: 3,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason: 'unsupported received property executable edge expect(Object.isFrozen(parsed)).toBe',
      occurrences: 3,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason:
        "unsupported received property executable edge expect(\n      parseM4AssignmentRequest(JSON.stringify({ ...request, staffId: '  staff-1  ' }))?.staffId\n    ).toBe",
      occurrences: 3,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason:
        "unsupported received property executable edge expect(\n      parseM4AssignmentRequest(\n        JSON.stringify({ ...request, command: 'm4.legacy.assign-claim', staffId: null })\n      )?.staffId\n    ).toBeNull",
      occurrences: 3,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason:
        "unsupported received property executable edge expect(\n      parseM4AssignmentRequest(\n        JSON.stringify({ ...request, command: 'm4.staff.assign-claim', staffId: undefined })\n      )\n    ).not.toHaveProperty",
      occurrences: 3,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason: 'unsupported callee form',
      occurrences: 2,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason:
        "unsupported received property executable edge expect(\n      parseM4AssignmentRequest(JSON.stringify({ ...request, [field]: 'untrusted' }))\n    ).toBeNull",
      occurrences: 3,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason:
        'unsupported received property executable edge expect(parseM4AssignmentRequest(value)).toBeNull',
      occurrences: 3,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason:
        'unsupported received property executable edge expect(parseM4AssignmentRequest(JSON.stringify({ ...request, ...override }))).toBeNull',
      occurrences: 3,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason:
        "unsupported received property executable edge expect(parseM4AssignmentRequest(' '.repeat(8193) + JSON.stringify(request))).toBeNull",
      occurrences: 3,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason:
        "unsupported received property executable edge expect(\n      parseM4AssignmentRequest(\n        ' '.repeat(8000) + JSON.stringify({ ...request, claimId: '文'.repeat(256) })\n      )\n    ).toBeNull",
      occurrences: 3,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason: 'unsupported callback container',
      occurrences: 3,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason: 'mutated or unsupported executable reference',
      occurrences: 12,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason: 'unsupported constructor callback',
      occurrences: 3,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason:
        'unsupported received property executable edge expect(parseM4AssignmentRequest(input)).toBeNull',
      occurrences: 3,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason: 'unsupported received property executable edge expect(calls).toBe',
      occurrences: 3,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason:
        'unsupported received property executable edge expect(new TextEncoder().encode(boundary).length).toBe',
      occurrences: 3,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason:
        'unsupported received property executable edge expect(parseM4AssignmentRequest(boundary)).toEqual',
      occurrences: 3,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason:
        "unsupported received property executable edge expect(parseM4AssignmentRequest(boundary + ' ')).toBeNull",
      occurrences: 3,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason:
        "unsupported received property executable edge expect(\n      parseM4AssignmentRequest(\n        JSON.stringify({ ...request, command: 'm4.legacy.assign-claim', staffId: undefined })\n      )\n    ).toBeNull",
      occurrences: 3,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.test.ts',
      reason:
        "unsupported received property executable edge expect(\n      parseM4AssignmentRequest(\n        JSON.stringify({ ...request, command: 'm4.staff.assign-claim', staffId: null })\n      )?.staffId\n    ).toBeNull",
      occurrences: 3,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.ts',
      reason: 'unsupported forwarded callback/value',
      occurrences: 9,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.ts',
      reason: 'unsupported mutated or bounded handle argument to unresolved callee',
      occurrences: 14,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.ts',
      reason: 'unsupported constructor executable edge',
      occurrences: 1,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.ts',
      reason: 'mutated executable callee',
      occurrences: 3,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.ts',
      reason: 'unsupported received property executable edge FIELDS.has',
      occurrences: 2,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.ts',
      reason: 'unsupported received property executable edge Object.keys(row).some',
      occurrences: 1,
    },
    {
      file: 'apps/web/src/server/operations/m4-assignment-protocol.ts',
      reason: 'unsupported received property executable edge UUID.test',
      occurrences: 1,
    },
  ],
};

for (const file of reviewed.files) {
  for (const item of file.imports) {
    for (const pair of item.names) Object.freeze(pair);
    Object.freeze(item.names);
    Object.freeze(item);
  }
  Object.freeze(file.imports);
  Object.freeze(file);
}
for (const row of reviewed.diagnostics) Object.freeze(row);
Object.freeze(reviewed.files);
Object.freeze(reviewed.diagnostics);
export const CLOSED_DATA_BOUNDARY = Object.freeze(reviewed);
