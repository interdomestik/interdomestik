import { ApiErrorCode } from '@/core-contracts';
import type { TenantStorageFamily } from '@/lib/storage/tenant-prefix';
import type * as DatabaseModule from '@interdomestik/database';
import { claimDocuments, claims, documents, policies } from '@interdomestik/database/schema';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';

type DatabaseClient = typeof DatabaseModule.db;

export interface DocumentAccessDeps {
  db: DatabaseClient;
  storage: {
    createSignedUrl: (
      bucket: string,
      path: string,
      expiresIn: number,
      options: { family: TenantStorageFamily; tenantId: string }
    ) => Promise<{ signedUrl?: string; error?: unknown }>;
    download: (
      bucket: string,
      path: string,
      options: { family: TenantStorageFamily; tenantId: string }
    ) => Promise<{ data?: Blob; error?: unknown }>;
  };
}

type SessionDTO = {
  user: {
    id: string;
    branchId?: string | null;
    role?: string | null;
    tenantId?: string | null;
  };
};

type DocumentRow = {
  id: string;
  claimId: string | null;
  bucket: string;
  filePath: string;
  uploadedBy: string | null;
  name: string | null;
  fileType: string | null;
  fileSize: number | null;
};

type DocumentAccessMode = 'signed_url' | 'download';
type PolymorphicDocumentRow = {
  id: string;
  entityId: string;
  entityType: string;
  uploadedBy: string | null;
};

export type DocumentAccessResult =
  | {
      ok: true;
      document: DocumentRow;
      audit: AuditContext;
      storageFamily: TenantStorageFamily;
      tenantId: string;
    }
  | { ok: false; code: ApiErrorCode; message?: string };

type AuditContext = {
  action: string;
  entityType: 'claim_document' | 'policy_document';
  entityId: string;
  actorRole: string | null;
  metadata: Record<string, unknown>;
};

function isFullTenantClaimsRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'tenant_admin' || role === 'super_admin';
}

function isScopedClaimReaderRole(role: string | null | undefined): boolean {
  return role === 'staff' || role === 'branch_manager' || role === 'agent';
}

function hasScopedClaimReadAccess(args: {
  branchId?: string | null;
  claim: {
    branchId?: string | null;
    staffId?: string | null;
    userId: string | null;
    agentId?: string | null;
  };
  role: string | null | undefined;
  userId: string;
}): boolean {
  if (args.role === 'agent') {
    return args.claim.agentId === args.userId;
  }
  const branchId = args.branchId ?? null;

  if (args.role === 'branch_manager') {
    return branchId !== null && args.claim.branchId === branchId;
  }

  if (branchId !== null) {
    return args.claim.branchId === branchId;
  }

  return args.claim.staffId === args.userId || args.claim.staffId == null;
}

export function safeFilename(value: string) {
  const ascii = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\r\n"\\]|[^\x20-\x7E]/g, '_')
    .trim();

  return ascii || 'document';
}

const RFC_5987_EXTRA_CHARS = /['()*]/g;

export function encodeContentDispositionFilename(value: string) {
  return encodeURIComponent(value).replace(
    RFC_5987_EXTRA_CHARS,
    character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function buildContentDispositionHeader(args: {
  disposition: 'inline' | 'attachment';
  filename: string;
}) {
  const fallbackFilename = safeFilename(args.filename || 'document');
  const encodedFilename = encodeContentDispositionFilename(args.filename || 'document');

  return `${args.disposition}; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`;
}

function getFinalDisposition(disposition?: 'inline' | 'attachment'): 'inline' | 'attachment' {
  return disposition === 'inline' ? 'inline' : 'attachment';
}

function getDocumentAction(disposition: 'inline' | 'attachment', mode: DocumentAccessMode): string {
  if (mode === 'signed_url') {
    return 'document.signed_url_issued';
  }

  return disposition === 'inline' ? 'document.view' : 'document.download';
}

function buildPolymorphicDocument(polyDoc: {
  id: string;
  entityType: string;
  storagePath: string;
  uploadedBy: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
}): DocumentRow {
  return {
    id: polyDoc.id,
    claimId: null,
    bucket: getPolymorphicDocumentBucket(polyDoc.entityType),
    filePath: polyDoc.storagePath,
    uploadedBy: polyDoc.uploadedBy,
    name: polyDoc.fileName,
    fileType: polyDoc.mimeType,
    fileSize: polyDoc.fileSize,
  };
}

function getPolymorphicDocumentBucket(entityType: string): string {
  if (entityType === 'policy') {
    return process.env.NEXT_PUBLIC_SUPABASE_POLICY_BUCKET || 'policies';
  }

  return process.env.NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET || 'claim-evidence';
}

function getPolymorphicDocumentAuditEntityType(entityType: string): AuditContext['entityType'] {
  if (entityType === 'policy') {
    return 'policy_document';
  }

  return 'claim_document';
}

function getStorageFamilyForDocument(document: DocumentRow): TenantStorageFamily {
  return document.bucket === (process.env.NEXT_PUBLIC_SUPABASE_POLICY_BUCKET || 'policies')
    ? 'policies'
    : 'claims';
}

function buildDocumentAudit(args: {
  actorRole: string | null | undefined;
  disposition: 'inline' | 'attachment';
  document: DocumentRow;
  documentId: string;
  entityType?: AuditContext['entityType'];
  mode: DocumentAccessMode;
}): AuditContext {
  const {
    actorRole,
    disposition,
    document,
    documentId,
    entityType = 'claim_document',
    mode,
  } = args;
  const metadata =
    mode === 'signed_url'
      ? {
          claimId: document.claimId,
          bucket: document.bucket,
          filePath: document.filePath,
          expiresInSeconds: 300,
        }
      : {
          claimId: document.claimId,
          bucket: document.bucket,
          filePath: document.filePath,
          fileType: document.fileType,
          fileSize: document.fileSize,
          disposition,
        };

  return {
    action: getDocumentAction(disposition, mode),
    entityType,
    entityId: documentId,
    actorRole: actorRole ?? null,
    metadata,
  };
}

async function canReadPolymorphicDocument(args: {
  db: DatabaseClient;
  polyDoc: PolymorphicDocumentRow;
  session: SessionDTO;
  tenantId: string;
  userRole: string | undefined;
}): Promise<boolean> {
  const { db, polyDoc, session, tenantId, userRole } = args;

  // 1. Full Tenant Roles always have access
  if (isFullTenantClaimsRole(userRole)) {
    return true;
  }

  // 2. Uploader access, except agents must still be assigned to claim documents and
  // policy documents must pass the policy-owner check below.
  if (
    polyDoc.uploadedBy === session.user.id &&
    !(userRole === 'agent' && polyDoc.entityType === 'claim') &&
    polyDoc.entityType !== 'policy'
  ) {
    return true;
  }

  // 3. Member Access to their own User/Member profile documents
  if (polyDoc.entityType === 'member' || polyDoc.entityType === 'user') {
    return polyDoc.entityId === session.user.id;
  }

  // 4. Claim Document Access
  if (polyDoc.entityType === 'claim') {
    return canReadPolymorphicClaimDocument(args);
  }

  // 5. Policy Document Access
  if (polyDoc.entityType === 'policy') {
    const [policyRow] = await db
      .select({ policyOwnerId: policies.userId })
      .from(policies)
      .where(and(eq(policies.id, polyDoc.entityId), eq(policies.tenantId, tenantId)));

    if (!policyRow) return false;

    return policyRow.policyOwnerId === session.user.id;
  }

  // 6. Thread / Communication Access (Future-proofing)
  // Logic for threads would go here, currently returning false to fail-closed.

  return false;
}

async function canReadPolymorphicClaimDocument(args: {
  db: DatabaseClient;
  polyDoc: PolymorphicDocumentRow;
  session: SessionDTO;
  tenantId: string;
  userRole: string | undefined;
}): Promise<boolean> {
  const { db, polyDoc, session, tenantId, userRole } = args;
  const [claimRow] = await db
    .select({
      claimOwnerId: claims.userId,
      claimBranchId: claims.branchId,
      claimStaffId: claims.staffId,
      claimAgentId: claims.agentId,
    })
    .from(claims)
    .where(and(eq(claims.id, polyDoc.entityId), eq(claims.tenantId, tenantId)));

  if (!claimRow) return false;

  // Member can read any document attached to their own claim.
  if (userRole !== 'agent' && claimRow.claimOwnerId === session.user.id) {
    return true;
  }

  if (!isScopedClaimReaderRole(userRole)) {
    return false;
  }

  return hasScopedClaimReadAccess({
    branchId: session.user.branchId ?? null,
    claim: {
      branchId: claimRow.claimBranchId ?? null,
      staffId: claimRow.claimStaffId ?? null,
      userId: claimRow.claimOwnerId ?? null,
      agentId: claimRow.claimAgentId ?? null,
    },
    role: userRole,
    userId: session.user.id,
  });
}

function canReadLegacyClaimDocument(args: {
  claim: {
    branchId: string | null;
    ownerId: string | null;
    staffId: string | null;
    agentId: string | null;
  };
  document: DocumentRow;
  session: SessionDTO;
  userRole: string | undefined;
}): boolean {
  const { claim, document, session, userRole } = args;

  if (isFullTenantClaimsRole(userRole)) {
    return true;
  }

  if (
    userRole !== 'agent' &&
    (document.uploadedBy === session.user.id || claim.ownerId === session.user.id)
  ) {
    return true;
  }

  if (!isScopedClaimReaderRole(userRole)) {
    return false;
  }

  return hasScopedClaimReadAccess({
    branchId: session.user.branchId ?? null,
    claim: {
      branchId: claim.branchId,
      staffId: claim.staffId,
      userId: claim.ownerId,
      agentId: claim.agentId,
    },
    role: userRole,
    userId: session.user.id,
  });
}

export async function getDocumentAccessCore(args: {
  session: SessionDTO;
  documentId: string;
  mode: DocumentAccessMode;
  disposition?: 'inline' | 'attachment';
  deps: DocumentAccessDeps;
}): Promise<DocumentAccessResult> {
  const { session, documentId, mode, disposition, deps } = args;
  const tenantId = ensureTenantId(session);
  const { db } = deps;
  const userRole = (session.user.role as string | undefined) ?? undefined;
  const finalDisposition = getFinalDisposition(disposition);

  // 1. Try Polymorphic Documents Table
  const [polyDoc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.tenantId, tenantId)));

  if (polyDoc) {
    const canRead = await canReadPolymorphicDocument({
      db,
      polyDoc,
      session,
      tenantId,
      userRole,
    });

    if (!canRead) {
      return { ok: false, code: 'FORBIDDEN', message: 'Forbidden' };
    }

    const document = buildPolymorphicDocument(polyDoc);

    return {
      ok: true,
      document,
      storageFamily: getStorageFamilyForDocument(document),
      tenantId,
      audit: buildDocumentAudit({
        actorRole: userRole,
        disposition: finalDisposition,
        document,
        documentId,
        entityType: getPolymorphicDocumentAuditEntityType(polyDoc.entityType),
        mode,
      }),
    };
  }

  // 2. Legacy Claim Documents
  const [row] = await db
    .select({
      doc: claimDocuments,
      claimOwnerId: claims.userId,
      claimBranchId: claims.branchId,
      claimStaffId: claims.staffId,
      claimAgentId: claims.agentId,
    })
    .from(claimDocuments)
    .leftJoin(claims, eq(claimDocuments.claimId, claims.id))
    .where(and(eq(claimDocuments.id, documentId), eq(claimDocuments.tenantId, tenantId)));

  if (!row?.doc) {
    return { ok: false, code: 'NOT_FOUND', message: 'Document not found' };
  }

  const doc = row.doc as never as DocumentRow;
  const canRead = canReadLegacyClaimDocument({
    claim: {
      branchId: row.claimBranchId ?? null,
      ownerId: row.claimOwnerId ?? null,
      staffId: row.claimStaffId ?? null,
      agentId: row.claimAgentId ?? null,
    },
    document: doc,
    session,
    userRole,
  });

  if (!canRead) {
    return { ok: false, code: 'FORBIDDEN', message: 'Forbidden' };
  }

  return {
    ok: true,
    document: doc,
    storageFamily: getStorageFamilyForDocument(doc),
    tenantId,
    audit: buildDocumentAudit({
      actorRole: userRole,
      disposition: finalDisposition,
      document: doc,
      documentId,
      mode,
    }),
  };
}

export async function createSignedDownloadUrlCore(args: {
  bucket: string;
  filePath: string;
  expiresInSeconds: number;
  family: TenantStorageFamily;
  deps: DocumentAccessDeps;
  tenantId: string;
}): Promise<{ ok: true; signedUrl: string } | { ok: false }> {
  const { bucket, filePath, expiresInSeconds, family, deps, tenantId } = args;
  const { signedUrl, error } = await deps.storage.createSignedUrl(
    bucket,
    filePath,
    expiresInSeconds,
    { family, tenantId }
  );

  if (error || !signedUrl) return { ok: false };
  return { ok: true, signedUrl };
}

export async function downloadStorageFileCore(args: {
  bucket: string;
  filePath: string;
  family: TenantStorageFamily;
  deps: DocumentAccessDeps;
  tenantId: string;
}): Promise<{ ok: true; data: Blob } | { ok: false }> {
  const { bucket, filePath, family, deps, tenantId } = args;
  const { data, error } = await deps.storage.download(bucket, filePath, { family, tenantId });

  if (error || !data) return { ok: false };
  return { ok: true, data };
}
