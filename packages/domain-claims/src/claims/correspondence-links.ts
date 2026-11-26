import {
  and,
  asc,
  claimCorrespondenceDocuments,
  claimCorrespondenceReceivedDocuments,
  eq,
  inArray,
  type TenantTransaction,
} from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';

function groupDocumentIds(links: { correspondenceId: string; documentId: string }[]) {
  const byEntry = new Map<string, string[]>();
  for (const link of links) {
    const ids = byEntry.get(link.correspondenceId) ?? [];
    ids.push(link.documentId);
    byEntry.set(link.correspondenceId, ids);
  }
  return byEntry;
}

export async function readReceivedDocumentLinks(
  tx: TenantTransaction,
  tenantId: string,
  claimId: string,
  inboundEntryIds: string[]
) {
  const received = claimCorrespondenceReceivedDocuments;
  return inboundEntryIds.length === 0
    ? []
    : await tx
        .select({
          correspondenceId: received.correspondenceId,
          documentId: received.claimDocumentId,
        })
        .from(received)
        .where(
          and(
            eq(received.tenantId, tenantId),
            eq(received.claimId, claimId),
            inArray(received.correspondenceId, inboundEntryIds)
          )
        )
        .orderBy(asc(received.claimDocumentId));
}

async function readSentDocumentLinks(
  tx: TenantTransaction,
  tenantId: string,
  claimId: string,
  entryIds: string[]
) {
  return entryIds.length === 0
    ? []
    : await tx
        .select({
          correspondenceId: claimCorrespondenceDocuments.correspondenceId,
          documentId: claimCorrespondenceDocuments.claimDocumentId,
        })
        .from(claimCorrespondenceDocuments)
        .where(
          withTenant(
            tenantId,
            claimCorrespondenceDocuments.tenantId,
            and(
              eq(claimCorrespondenceDocuments.claimId, claimId),
              inArray(claimCorrespondenceDocuments.correspondenceId, entryIds)
            )
          )
        )
        .orderBy(asc(claimCorrespondenceDocuments.claimDocumentId));
}

export async function readCorrespondenceDocumentLinks(
  tx: TenantTransaction,
  tenantId: string,
  claimId: string,
  entries: readonly { id: string; direction: string }[]
) {
  const sent = await readSentDocumentLinks(
    tx,
    tenantId,
    claimId,
    entries.map(row => row.id)
  );
  const received = await readReceivedDocumentLinks(
    tx,
    tenantId,
    claimId,
    entries.filter(row => row.direction === 'inbound').map(row => row.id)
  );
  return { byEntry: groupDocumentIds(sent), receivedByEntry: groupDocumentIds(received) };
}
