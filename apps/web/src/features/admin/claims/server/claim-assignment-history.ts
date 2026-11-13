import type { TimelineActorRole } from '@/features/claims/timeline/types';

/** Audit actions written by the admin and staff assignment writers; nothing else is projected. */
export const ASSIGNED_AUDIT_ACTIONS = ['assign_owner', 'claim.assigned'] as const;
export const UNASSIGNED_AUDIT_ACTIONS = ['unassign_owner', 'claim.unassigned'] as const;
export const ASSIGNMENT_AUDIT_ACTIONS = [...ASSIGNED_AUDIT_ACTIONS, ...UNASSIGNED_AUDIT_ACTIONS];

/** An existing assignment audit event, read-only. It never represents a status change. */
export type AssignmentTimelineEntry = Readonly<{
  id: string;
  kind: 'assigned' | 'unassigned';
  timestamp: Date;
  toHandlerName: string | null;
  fromHandlerName: string | null;
  actorName: string | null;
  actorRole: TimelineActorRole;
}>;

export type RawAssignmentAuditRow = Readonly<{
  id: string;
  action: string;
  createdAt: Date | null;
  actorId: string | null;
  actorRole: string | null;
  metadata: unknown;
}>;

function metadataId(metadata: unknown, key: 'newStaffId' | 'previousStaffId'): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function assignmentKind(action: string): AssignmentTimelineEntry['kind'] | null {
  if ((ASSIGNED_AUDIT_ACTIONS as readonly string[]).includes(action)) return 'assigned';
  if ((UNASSIGNED_AUDIT_ACTIONS as readonly string[]).includes(action)) return 'unassigned';
  return null;
}

// The admin writer records no actor role; its actions are admin-only by construction.
function actorRoleFor(row: RawAssignmentAuditRow): TimelineActorRole {
  if (row.action === 'assign_owner' || row.action === 'unassign_owner') return 'admin';
  const role = row.actorRole?.toLowerCase() ?? '';
  if (role.includes('admin')) return 'admin';
  if (role === 'staff') return 'staff';
  return 'system';
}

/** Handler and actor ids whose display names the read resolves inside the same tenant. */
export function collectAssignmentUserIds(rows: readonly RawAssignmentAuditRow[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const id of [
      metadataId(row.metadata, 'newStaffId'),
      metadataId(row.metadata, 'previousStaffId'),
      row.actorId,
    ]) {
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

/**
 * Maps audit rows to assignment entries. Rows without a timestamp, with an unknown action, or an
 * assignment without a target handler are dropped instead of guessed.
 */
export function mapAssignmentAuditRows(
  rows: readonly RawAssignmentAuditRow[],
  names: ReadonlyMap<string, string>
): AssignmentTimelineEntry[] {
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? null) : null);
  return rows.flatMap(row => {
    const kind = assignmentKind(row.action);
    const toHandlerId = metadataId(row.metadata, 'newStaffId');
    if (!kind || !row.createdAt || (kind === 'assigned' && !toHandlerId)) return [];
    return [
      {
        id: `assignment-${row.id}`,
        kind,
        timestamp: row.createdAt,
        toHandlerName: kind === 'assigned' ? nameOf(toHandlerId) : null,
        fromHandlerName: nameOf(metadataId(row.metadata, 'previousStaffId')),
        actorName: nameOf(row.actorId),
        actorRole: actorRoleFor(row),
      },
    ];
  });
}
