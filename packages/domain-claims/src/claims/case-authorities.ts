import {
  and,
  asc,
  claimAuthorities,
  eq,
  isNull,
  sql,
  type TenantTransaction,
} from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { z } from 'zod';
import {
  lockCaseForRegister,
  lockRegisterDocuments,
  registerClaimInput,
  registerDecisionTime,
  registerFailure,
  registerForbidden,
  registerId,
  registerText,
  registerTimestamp,
  resolveRegisterRead,
  resolveRegisterWrite,
  type LockedRegister,
  registerUuid,
  retryRegisterDeadlock,
  normalizeRegisterInput,
} from './case-register-access';
import { caseAuthorityScopes } from './outward-action-requirements';
import type { ClaimsSession } from './types';

type AuthorityKind = keyof typeof caseAuthorityScopes;

export const recordCaseAuthorityInputSchema = registerClaimInput.extend({
  correlationId: registerUuid,
  kind: z.enum(Object.keys(caseAuthorityScopes) as AuthorityKind[]),
  evidenceDocumentId: registerId,
  version: registerText(50),
  grantedAt: registerTimestamp,
  expiresAt: registerTimestamp.nullish(),
  jurisdictionCountryCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  jurisdictionAppropriateConfirmed: z.literal(true).optional(),
  purpose: registerText(500).optional(),
});

const grantDecisionSchema = recordCaseAuthorityInputSchema.refine(input => {
  const requiresJurisdiction = input.kind === 'power_of_attorney';
  const requiresPurpose = input.kind === 'consent_or_lawful_basis';
  return (
    requiresJurisdiction === Boolean(input.jurisdictionCountryCode) &&
    requiresJurisdiction === Boolean(input.jurisdictionAppropriateConfirmed) &&
    requiresPurpose === Boolean(input.purpose) &&
    (!input.expiresAt || Date.parse(input.expiresAt) > Date.parse(input.grantedAt))
  );
});

export const revokeCaseAuthorityInputSchema = registerClaimInput.extend({
  authorityId: registerUuid,
});
export const listCaseAuthoritiesInputSchema = registerClaimInput;

type RecordAuthority = z.infer<typeof recordCaseAuthorityInputSchema>;
type RevokeAuthority = z.infer<typeof revokeCaseAuthorityInputSchema>;
type AuthorityRow = typeof claimAuthorities.$inferSelect;

function toGrantFields(input: RecordAuthority) {
  return {
    kind: input.kind,
    scope: caseAuthorityScopes[input.kind],
    version: input.version,
    evidenceDocumentId: input.evidenceDocumentId,
    jurisdictionCountryCode: input.jurisdictionCountryCode ?? null,
    purpose: input.purpose ?? null,
    grantedAt: new Date(input.grantedAt),
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
  };
}

function replayAuthority(
  row: AuthorityRow | undefined,
  fields: ReturnType<typeof toGrantFields>,
  actorId: string
) {
  if (
    row?.recordedByStaffId === actorId &&
    row.kind === fields.kind &&
    row.version === fields.version &&
    row.evidenceDocumentId === fields.evidenceDocumentId &&
    row.jurisdictionCountryCode === fields.jurisdictionCountryCode &&
    row.purpose === fields.purpose &&
    row.grantedAt.getTime() === fields.grantedAt.getTime() &&
    row.expiresAt?.getTime() === fields.expiresAt?.getTime()
  ) {
    return { ok: true, authorityId: row.id } as const;
  }
  return { ok: false, code: 'conflict' } as const;
}

async function insertAuthority({ tx, tenantId, actorId }: LockedRegister, input: RecordAuthority) {
  const fields = toGrantFields(input);
  const [existing] = await tx
    .select()
    .from(claimAuthorities)
    .where(
      withTenant(
        tenantId,
        claimAuthorities.tenantId,
        and(
          eq(claimAuthorities.claimId, input.claimId),
          eq(claimAuthorities.correlationId, input.correlationId)
        )
      )
    );
  if (existing) return replayAuthority(existing, fields, actorId);

  const documents = await lockRegisterDocuments(tx, tenantId, input.claimId, [
    input.evidenceDocumentId,
  ]);
  const evidence = documents?.[0];
  if (!evidence) return { ok: false, code: 'document_invalid' } as const;
  const decisionAt = await registerDecisionTime(tx);
  if (fields.grantedAt > decisionAt) return { ok: false, code: 'authority_invalid' } as const;
  const attests = input.kind === 'power_of_attorney';
  const [created] = await tx
    .insert(claimAuthorities)
    .values({
      ...fields,
      claimId: input.claimId,
      correlationId: input.correlationId,
      evidenceBucket: evidence.bucket,
      evidenceFilePath: evidence.filePath,
      jurisdictionAttestedByUserId: attests ? actorId : null,
      jurisdictionAttestedAt: attests ? decisionAt : null,
      recordedByStaffId: actorId,
      tenantId,
    })
    .onConflictDoNothing({ target: [claimAuthorities.tenantId, claimAuthorities.correlationId] })
    .returning({ id: claimAuthorities.id });
  if (created) return { ok: true, authorityId: created.id } as const;
  const [concurrent] = await tx
    .select()
    .from(claimAuthorities)
    .where(
      withTenant(
        tenantId,
        claimAuthorities.tenantId,
        and(
          eq(claimAuthorities.claimId, input.claimId),
          eq(claimAuthorities.correlationId, input.correlationId)
        )
      )
    );
  return replayAuthority(concurrent, fields, actorId);
}

export async function recordCaseAuthority(
  session: ClaimsSession | null,
  authority: TenantAuthority | null,
  input: unknown
) {
  const access = resolveRegisterWrite(session, authority, input, grantDecisionSchema);
  if (!access.ok) return access;
  const { tenantId, actor } = access;
  const data = normalizeRegisterInput(access.data);
  try {
    return await withTenantAuthority(access.authority, async tx => {
      if (!(await lockCaseForRegister(tx, tenantId, data.claimId, actor))) return registerForbidden;
      return insertAuthority({ tx, tenantId, actorId: actor.userId }, data);
    });
  } catch (error) {
    return registerFailure(error);
  }
}

async function revokeAuthority({ tx, tenantId, actorId }: LockedRegister, input: RevokeAuthority) {
  const [existing] = await tx
    .select({ id: claimAuthorities.id, revokedBy: claimAuthorities.revokedByUserId })
    .from(claimAuthorities)
    .where(
      withTenant(
        tenantId,
        claimAuthorities.tenantId,
        and(eq(claimAuthorities.claimId, input.claimId), eq(claimAuthorities.id, input.authorityId))
      )
    )
    .for('update');
  if (!existing) return { ok: false, code: 'authority_invalid' } as const;
  if (existing.revokedBy === actorId) return { ok: true, authorityId: existing.id } as const;
  if (existing.revokedBy) return { ok: false, code: 'conflict' } as const;
  const [updated] = await tx
    .update(claimAuthorities)
    .set({
      revokedAt: sql`pg_catalog.clock_timestamp()`,
      revokedByUserId: actorId,
    })
    .where(
      withTenant(
        tenantId,
        claimAuthorities.tenantId,
        and(
          eq(claimAuthorities.claimId, input.claimId),
          eq(claimAuthorities.id, input.authorityId),
          isNull(claimAuthorities.revokedAt)
        )
      )
    )
    .returning({ id: claimAuthorities.id });
  return updated
    ? ({ ok: true, authorityId: updated.id } as const)
    : ({ ok: false, code: 'conflict' } as const);
}

export async function revokeCaseAuthority(
  session: ClaimsSession | null,
  authority: TenantAuthority | null,
  input: unknown
) {
  const access = resolveRegisterWrite(session, authority, input, revokeCaseAuthorityInputSchema);
  if (!access.ok) return access;
  const { tenantId, actor } = access;
  const data = normalizeRegisterInput(access.data);
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await withTenantAuthority(access.authority, async tx => {
        if (!(await lockCaseForRegister(tx, tenantId, data.claimId, actor))) {
          return registerForbidden;
        }
        return revokeAuthority({ tx, tenantId, actorId: actor.userId }, data);
      });
    } catch (error) {
      if (!retryRegisterDeadlock(error, attempt)) return registerFailure(error);
    }
  }
}

async function readAuthorities(tx: TenantTransaction, tenantId: string, claimId: string) {
  const rows = await tx
    .select({
      id: claimAuthorities.id,
      kind: claimAuthorities.kind,
      scope: claimAuthorities.scope,
      evidenceDocumentId: claimAuthorities.evidenceDocumentId,
      version: claimAuthorities.version,
      jurisdictionCountryCode: claimAuthorities.jurisdictionCountryCode,
      jurisdictionAttestedByUserId: claimAuthorities.jurisdictionAttestedByUserId,
      jurisdictionAttestedAt: claimAuthorities.jurisdictionAttestedAt,
      purpose: claimAuthorities.purpose,
      grantedAt: claimAuthorities.grantedAt,
      expiresAt: claimAuthorities.expiresAt,
      revokedAt: claimAuthorities.revokedAt,
      revokedByUserId: claimAuthorities.revokedByUserId,
      recordedByStaffId: claimAuthorities.recordedByStaffId,
      createdAt: claimAuthorities.createdAt,
    })
    .from(claimAuthorities)
    .where(
      withTenant(tenantId, claimAuthorities.tenantId, and(eq(claimAuthorities.claimId, claimId)))
    )
    .orderBy(asc(claimAuthorities.createdAt), asc(claimAuthorities.id));
  return {
    authorities: rows.map(row => ({
      ...row,
      jurisdictionAttestedAt: row.jurisdictionAttestedAt?.toISOString() ?? null,
      grantedAt: row.grantedAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export type CaseAuthorityEntry = Awaited<ReturnType<typeof readAuthorities>>['authorities'][number];

export async function listCaseAuthorities(
  session: ClaimsSession | null,
  authority: TenantAuthority | null,
  input: unknown
) {
  const access = resolveRegisterRead(session, authority, input, 'full');
  if (!access.ok) return access;
  const { tenantId, actor, data } = access;
  return withTenantAuthority(access.authority, async tx => {
    if (!(await lockCaseForRegister(tx, tenantId, data.claimId, actor, 'full'))) {
      return registerForbidden;
    }
    return { ...(await readAuthorities(tx, tenantId, data.claimId)), ok: true as const };
  });
}
