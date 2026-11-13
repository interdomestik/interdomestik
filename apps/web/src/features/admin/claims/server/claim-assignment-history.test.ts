import { describe, expect, it } from 'vitest';

import {
  collectAssignmentUserIds,
  mapAssignmentAuditRows,
  type RawAssignmentAuditRow,
} from './claim-assignment-history';

const at = new Date('2026-11-13T10:00:00Z');
const row = (overrides: Partial<RawAssignmentAuditRow>): RawAssignmentAuditRow => ({
  id: 'a1',
  action: 'assign_owner',
  createdAt: at,
  actorId: 'admin-1',
  actorRole: null,
  metadata: { previousStaffId: 'staff-0', newStaffId: 'staff-1' },
  ...overrides,
});
const names = new Map([
  ['staff-0', 'Besa Krasniqi'],
  ['staff-1', 'Drita Gashi'],
  ['admin-1', 'Arta Admin'],
  ['staff-2', 'Ilir Staff'],
]);

describe('mapAssignmentAuditRows', () => {
  it('maps an admin reassignment with both handler names and the actor', () => {
    expect(mapAssignmentAuditRows([row({})], names)).toEqual([
      {
        id: 'assignment-a1',
        kind: 'assigned',
        timestamp: at,
        toHandlerName: 'Drita Gashi',
        fromHandlerName: 'Besa Krasniqi',
        actorName: 'Arta Admin',
        actorRole: 'admin',
      },
    ]);
  });

  it('maps admin and staff removals without a target handler', () => {
    const rows = [
      row({ id: 'u1', action: 'unassign_owner', metadata: { previousStaffId: 'staff-1' } }),
      row({
        id: 'u2',
        action: 'claim.unassigned',
        actorId: 'staff-2',
        actorRole: 'staff',
        metadata: { previousStaffId: 'staff-1', newStaffId: null },
      }),
    ];
    expect(mapAssignmentAuditRows(rows, names)).toMatchObject([
      { id: 'assignment-u1', kind: 'unassigned', toHandlerName: null, actorRole: 'admin' },
      {
        id: 'assignment-u2',
        kind: 'unassigned',
        fromHandlerName: 'Drita Gashi',
        actorRole: 'staff',
      },
    ]);
  });

  it('keeps unresolved names empty instead of exposing raw ids', () => {
    const [entry] = mapAssignmentAuditRows(
      [row({ action: 'claim.assigned', actorRole: 'tenant_admin' })],
      new Map()
    );
    expect(entry).toMatchObject({
      toHandlerName: null,
      fromHandlerName: null,
      actorName: null,
      actorRole: 'admin',
    });
    expect(JSON.stringify(entry)).not.toContain('staff-1');
  });

  it('drops rows it cannot represent truthfully', () => {
    const rows = [
      row({ id: 'no-time', createdAt: null }),
      row({ id: 'other', action: 'status_change' }),
      row({ id: 'no-target', metadata: { previousStaffId: 'staff-0' } }),
      row({ id: 'bad-meta', action: 'claim.assigned', metadata: 'staff-1' }),
    ];
    expect(mapAssignmentAuditRows(rows, names)).toHaveLength(0);
  });

  it('falls back to the system actor for an unknown staff-writer role', () => {
    const [entry] = mapAssignmentAuditRows(
      [row({ action: 'claim.assigned', actorRole: null })],
      names
    );
    expect(entry.actorRole).toBe('system');
  });
});

describe('collectAssignmentUserIds', () => {
  it('collects distinct handler and actor ids, ignoring malformed metadata', () => {
    expect(
      collectAssignmentUserIds([
        row({}),
        row({ id: 'a2', actorId: null, metadata: { newStaffId: 'staff-1', previousStaffId: 7 } }),
        row({ id: 'a3', actorId: 'admin-1', metadata: null }),
      ])
    ).toEqual(['staff-1', 'staff-0', 'admin-1']);
  });
});
