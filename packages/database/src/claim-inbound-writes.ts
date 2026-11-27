import { sql } from 'drizzle-orm';
import type {
  claimCorrespondenceReceivedDocuments,
  claimInboundUploadDecisions,
} from './schema/claim-inbound-documents';
import type { TenantTransaction } from './tenant';

type DecisionInsert = Omit<typeof claimInboundUploadDecisions.$inferInsert, 'id' | 'decidedAt'>;

export async function insertClaimInboundDecision(tx: TenantTransaction, decision: DecisionInsert) {
  // The role can return the generated id but cannot name it or decided_at in the insert target list.
  const [created] = await tx.execute<{ id: string }>(sql`
    insert into public.claim_inbound_upload_decisions (
      tenant_id, claim_id, correlation_id, classification, decided_by, role_basis,
      recipient_id, uploader_id, office_receipt_ref, document_id, bucket, file_path,
      file_name, mime_type, file_size, sha256
    ) values (
      ${decision.tenantId}, ${decision.claimId}, ${decision.correlationId}, ${decision.classification},
      ${decision.decidedBy}, ${decision.roleBasis}, ${decision.recipientId}, ${decision.uploaderId},
      ${decision.officeReceiptRef}, ${decision.documentId}, ${decision.bucket}, ${decision.filePath},
      ${decision.fileName}, ${decision.mimeType}, ${decision.fileSize}, ${decision.sha256}
    ) on conflict (tenant_id, correlation_id) do nothing returning id
  `);
  return created;
}

type ReceivedLink = Omit<typeof claimCorrespondenceReceivedDocuments.$inferInsert, 'createdAt'>;

export async function insertClaimReceivedLinks(
  tx: TenantTransaction,
  links: readonly ReceivedLink[]
) {
  if (!links.length) return;
  const values = links.map(
    link =>
      sql`(${link.tenantId}, ${link.claimId}, ${link.correspondenceId}, ${link.claimDocumentId})`
  );
  // created_at is database-owned and absent from the runtime insert grant.
  await tx.execute(sql`
    insert into public.claim_correspondence_received_documents (tenant_id, claim_id, correspondence_id, claim_document_id)
    values ${sql.join(values, sql`, `)}
  `);
}
