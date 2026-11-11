import 'server-only';

import { branches, supportHandoffs, user } from '@interdomestik/database/schema';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { and, desc, eq } from 'drizzle-orm';
import type { RestrictedRead } from '../communication/get-claim-message-metadata';
import { handoffMetadataScope, type HandoffMetadataFilters } from './metadata-scope';

const columns = {
  id: supportHandoffs.id,
  status: supportHandoffs.status,
  urgency: supportHandoffs.urgency,
  staffId: supportHandoffs.staffId,
  staffName: user.name,
  branchId: supportHandoffs.branchId,
  branchName: branches.name,
  createdAt: supportHandoffs.createdAt,
  updatedAt: supportHandoffs.updatedAt,
  acceptedAt: supportHandoffs.acceptedAt,
  reassignedAt: supportHandoffs.reassignedAt,
  closedAt: supportHandoffs.closedAt,
  publicResponseAt: supportHandoffs.publicResponseAt,
  publicResponseCount: supportHandoffs.publicResponseVersion,
  memberReplyAt: supportHandoffs.memberReplyAt,
};

type MetadataRow = {
  id: string;
  status: string;
  urgency: string;
  staffId: string | null;
  staffName: string | null;
  branchId: string | null;
  branchName: string | null;
  createdAt: Date;
  updatedAt: Date;
  acceptedAt: Date | null;
  reassignedAt: Date | null;
  closedAt: Date | null;
  publicResponseAt: Date | null;
  publicResponseCount: number;
  memberReplyAt: Date | null;
};

const date = (value: Date | null): string | null => (value ? value.toISOString() : null);
/** Explicit DTO construction prevents accidental propagation of future reader columns. */
function toMetadata(row: MetadataRow) {
  return {
    id: row.id,
    status: row.status === 'accepted' || row.status === 'closed' ? row.status : 'open',
    urgency: ['critical', 'high', 'low'].includes(row.urgency) ? row.urgency : 'normal',
    staffId: row.staffId,
    staffName: row.staffName,
    branchId: row.branchId,
    branchName: row.branchName,
    createdAt: date(row.createdAt),
    updatedAt: date(row.updatedAt),
    acceptedAt: date(row.acceptedAt),
    reassignedAt: date(row.reassignedAt),
    closedAt: date(row.closedAt),
    publicResponseAt: date(row.publicResponseAt),
    // Version is the count of staff response revisions, not a count of historical replies.
    publicResponseCount: row.publicResponseCount,
    memberReplyAt: date(row.memberReplyAt),
  };
}
export type HandoffMetadata = Readonly<ReturnType<typeof toMetadata>>;

export async function getHandoffMetadata(args: {
  authority: TenantAuthority;
  filters?: HandoffMetadataFilters;
  handoffId?: string;
}): Promise<RestrictedRead<HandoffMetadata[]>> {
  try {
    const scope = handoffMetadataScope(args.authority, args.filters ?? {}, args.handoffId);
    if (!scope) return { kind: 'unavailable' };
    return await withTenantAuthority<RestrictedRead<HandoffMetadata[]>>(
      args.authority,
      async tx => {
        const rows = await tx
          .select(columns)
          .from(supportHandoffs)
          .leftJoin(
            user,
            and(eq(user.id, supportHandoffs.staffId), eq(user.tenantId, scope.tenantId))
          )
          .leftJoin(
            branches,
            and(eq(branches.id, supportHandoffs.branchId), eq(branches.tenantId, scope.tenantId))
          )
          .where(scope.where)
          .orderBy(desc(supportHandoffs.createdAt), desc(supportHandoffs.id))
          .limit(args.handoffId === undefined ? 30 : 1);
        return { kind: 'ok', data: rows.map(toMetadata) };
      }
    );
  } catch {
    return { kind: 'failed' };
  }
}
