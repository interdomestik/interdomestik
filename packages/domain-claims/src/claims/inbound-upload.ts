import { randomUUID } from 'node:crypto';

import { and, eq, isNotNull } from 'drizzle-orm';
import { type TenantTransaction } from '@interdomestik/database';
import { withPrincipalTenantContext } from '@interdomestik/database/free-start-drafts';
import {
  claimInboundPilotCases,
  claimInboundUploadDecisions,
  claims,
} from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { z } from 'zod';

import { registerId, registerUuid } from './case-register-input';
import { claimLifecycleStatusNotIn } from './lifecycle-read-sql';
import { buildStaffClaimReadScope } from '../staff-claims/scope';

export const INBOUND_PDF_MAX_BYTES = 1024 * 1024;
export const inboundUploadDecisionInput = z.strictObject({
  claimId: registerId.max(128),
  correlationId: registerUuid,
  classification: z.enum(['intended-for-member', 'approved-to-show']),
  officeReceiptRef: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
  fileName: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[^\\/\u0000-\u001f]+\.pdf$/i),
  fileSize: z.number().int().min(1).max(INBOUND_PDF_MAX_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

type DecisionInput = z.infer<typeof inboundUploadDecisionInput>;
export type InboundUploadDecision = typeof claimInboundUploadDecisions.$inferSelect;

export function isInboundPilotCase(authority: TenantAuthority, claimId: string) {
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, async tx => {
    const [row] = await tx
      .select({ id: claimInboundPilotCases.claimId })
      .from(claimInboundPilotCases)
      .where(
        and(
          eq(claimInboundPilotCases.tenantId, tenantId),
          eq(claimInboundPilotCases.claimId, claimId),
          isNotNull(claimInboundPilotCases.enrolledAt)
        )
      );
    return Boolean(row);
  });
}

export function readClaimUploadPaused(
  authority: TenantAuthority,
  homeTenantId: string,
  claimId: string
) {
  return withTenantAuthority(authority, async tx => {
    const [status] = await tx
      .select({ paused: claimInboundPilotCases.paused })
      .from(claims)
      .leftJoin(
        claimInboundPilotCases,
        and(
          eq(claimInboundPilotCases.tenantId, claims.tenantId),
          eq(claimInboundPilotCases.claimId, claims.id)
        )
      )
      .where(and(eq(claims.tenantId, homeTenantId), eq(claims.id, claimId)));
    return !status || status.paused === true;
  });
}

async function lockInboundPilotCase(
  tx: TenantTransaction,
  tenantId: string,
  claimId: string,
  principal: NonNullable<ReturnType<typeof readTenantAuthority>['principal']>
) {
  const staffScope =
    principal.role === 'staff'
      ? buildStaffClaimReadScope({
          claimId,
          role: principal.role,
          branchId: principal.branchId,
          userId: principal.userId,
        })
      : undefined;
  const [row] = await tx
    .select({ recipientId: claims.userId, uploaderId: claims.staffId })
    .from(claims)
    .innerJoin(
      claimInboundPilotCases,
      and(
        eq(claimInboundPilotCases.tenantId, claims.tenantId),
        eq(claimInboundPilotCases.claimId, claims.id)
      )
    )
    .where(
      and(
        eq(claims.tenantId, tenantId),
        eq(claims.id, claimId),
        claimLifecycleStatusNotIn(['draft']),
        isNotNull(claimInboundPilotCases.enrolledAt),
        eq(claimInboundPilotCases.paused, false),
        staffScope
      )
    )
    .for('update', { of: claims });
  if (!row?.recipientId || !row.uploaderId) return null;
  return { recipientId: row.recipientId, uploaderId: row.uploaderId };
}

function matchesDecision(
  row: InboundUploadDecision,
  input: DecisionInput,
  actorId: string,
  bucket: string
) {
  return (
    row.claimId === input.claimId &&
    row.decidedBy === actorId &&
    row.classification === input.classification &&
    row.officeReceiptRef === input.officeReceiptRef &&
    row.fileName === input.fileName &&
    row.fileSize === input.fileSize &&
    row.sha256 === input.sha256 &&
    row.bucket === bucket
  );
}

export async function recordInboundUploadDecision(
  authority: TenantAuthority,
  input: DecisionInput,
  storage: { bucket: string; pathForDocument: (documentId: string) => string }
) {
  const { tenantId, accessTenantId, principal } = readTenantAuthority(authority);
  const role = input.classification === 'intended-for-member' ? 'staff' : 'tenant_admin';
  if (tenantId !== accessTenantId || principal?.role !== role) {
    return { ok: false, code: 'forbidden' } as const;
  }
  return withPrincipalTenantContext(authority, async tx => {
    const scope = await lockInboundPilotCase(tx, tenantId, input.claimId, principal);
    if (!scope || (role === 'staff' && principal.userId !== scope.uploaderId)) {
      return { ok: false, code: 'forbidden' } as const;
    }
    const correlation = and(
      eq(claimInboundUploadDecisions.tenantId, tenantId),
      eq(claimInboundUploadDecisions.correlationId, input.correlationId)
    );
    const [existing] = await tx.select().from(claimInboundUploadDecisions).where(correlation);
    if (existing) return decisionResult(existing, input, principal.userId, storage.bucket);
    const documentId = 'wp12-inbound-' + randomUUID().replaceAll('-', '');
    const [created] = await tx
      .insert(claimInboundUploadDecisions)
      .values({
        claimId: input.claimId,
        correlationId: input.correlationId,
        classification: input.classification,
        officeReceiptRef: input.officeReceiptRef,
        fileName: input.fileName,
        fileSize: input.fileSize,
        sha256: input.sha256,
        recipientId: scope.recipientId,
        uploaderId: scope.uploaderId,
        tenantId,
        decidedBy: principal.userId,
        roleBasis: role,
        bucket: storage.bucket,
        filePath: storage.pathForDocument(documentId),
        documentId,
        mimeType: 'application/pdf',
      })
      .onConflictDoNothing({
        target: [claimInboundUploadDecisions.tenantId, claimInboundUploadDecisions.correlationId],
      })
      .returning();
    if (created) return { ok: true, decisionId: created.id } as const;
    const [winner] = await tx.select().from(claimInboundUploadDecisions).where(correlation);
    return decisionResult(winner, input, principal.userId, storage.bucket);
  });
}

function decisionResult(
  row: InboundUploadDecision | undefined,
  input: DecisionInput,
  actorId: string,
  bucket: string
) {
  return row && matchesDecision(row, input, actorId, bucket)
    ? ({ ok: true, decisionId: row.id } as const)
    : ({ ok: false, code: 'conflict' } as const);
}

export async function loadInboundUploadDecision(
  tx: TenantTransaction,
  authority: TenantAuthority,
  claimId: string,
  decisionId: string
) {
  const { tenantId, accessTenantId, principal } = readTenantAuthority(authority);
  if (tenantId !== accessTenantId || principal?.role !== 'staff') return null;
  const scope = await lockInboundPilotCase(tx, tenantId, claimId, principal);
  if (scope?.uploaderId !== principal.userId) return null;
  const [decision] = await tx
    .select()
    .from(claimInboundUploadDecisions)
    .where(
      and(
        eq(claimInboundUploadDecisions.tenantId, tenantId),
        eq(claimInboundUploadDecisions.claimId, claimId),
        eq(claimInboundUploadDecisions.id, decisionId),
        eq(claimInboundUploadDecisions.uploaderId, principal.userId),
        eq(claimInboundUploadDecisions.recipientId, scope.recipientId)
      )
    );
  return decision ?? null;
}
