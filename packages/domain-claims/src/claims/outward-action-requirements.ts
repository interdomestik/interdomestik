import { asc, claimAuthorities, eq, inArray, sql } from '@interdomestik/database';
import { z } from 'zod';
import { registerChildWhere, registerId, type LockedRegister } from './case-register-access';

export const caseAuthorityScopes = {
  recovery_agreement: 'recovery',
  signed_assignment: 'recovery',
  power_of_attorney: 'representation',
  consent_or_lawful_basis: 'document_sharing',
} as const;

const recovery = {
  kind: 'recovery_agreement',
  scope: caseAuthorityScopes.recovery_agreement,
  field: 'recoveryAuthorityId',
} as const;
const representation = {
  kind: 'power_of_attorney',
  scope: caseAuthorityScopes.power_of_attorney,
  field: 'representationAuthorityId',
} as const;
const sharing = {
  kind: 'consent_or_lawful_basis',
  scope: caseAuthorityScopes.consent_or_lawful_basis,
  field: 'sharingAuthorityId',
} as const;

export const outwardActionRequirements = {
  outbound_contact: [recovery, representation],
  outbound_contact_with_documents: [recovery, representation, sharing],
  inbound_record: [],
  follow_up: [],
  case_fields: [],
} as const;

export const outboundAuthorityFields = z.object({
  recoveryAuthorityId: z.uuid(),
  representationAuthorityId: z.uuid(),
  sharingAuthorityId: z.uuid().optional(),
  sharingCoveredByConsentConfirmed: z.literal(true).optional(),
  sharedDocumentIds: z.array(registerId).optional(),
});

export function outboundSharingIsAttested(input: z.infer<typeof outboundAuthorityFields>) {
  const ids = input.sharedDocumentIds;
  if (ids?.length) {
    return (
      new Set(ids).size === ids.length &&
      Boolean(input.sharingAuthorityId && input.sharingCoveredByConsentConfirmed)
    );
  }
  return !input.sharingAuthorityId && !input.sharingCoveredByConsentConfirmed;
}

type OutboundBasisIds = {
  recoveryAuthorityId: string;
  representationAuthorityId: string;
  sharingAuthorityId?: string;
};
type AuthorityRow = typeof claimAuthorities.$inferSelect;

function requiredBases(input: OutboundBasisIds) {
  const rules = input.sharingAuthorityId
    ? outwardActionRequirements.outbound_contact_with_documents
    : outwardActionRequirements.outbound_contact;
  return rules.map(rule => ({ rule, id: input[rule.field] ?? '' }));
}

export async function lockOutboundAuthorities(
  { tx, tenantId }: LockedRegister,
  claimId: string,
  input: OutboundBasisIds
) {
  const bases = requiredBases(input);
  const rows = await tx
    .select()
    .from(claimAuthorities)
    .where(
      registerChildWhere(
        claimAuthorities,
        tenantId,
        claimId,
        inArray(
          claimAuthorities.id,
          bases.map(basis => basis.id)
        )
      )
    )
    .orderBy(asc(claimAuthorities.id))
    .for('update');
  return { bases, rows };
}

function eligibleAt(
  row: AuthorityRow | undefined,
  rule: typeof recovery | typeof representation | typeof sharing,
  now: Date
) {
  return Boolean(
    row?.kind === rule.kind &&
    row.scope === rule.scope &&
    !row.revokedAt &&
    row.grantedAt <= now &&
    (!row.expiresAt || row.expiresAt > now)
  );
}

export async function outboundAuthoritiesAreValid(
  { tx, tenantId }: LockedRegister,
  input: OutboundBasisIds & { claimId: string },
  { bases, rows }: Awaited<ReturnType<typeof lockOutboundAuthorities>>,
  decisionAt: Date
) {
  if (rows.length !== bases.length) return false;
  if (
    !bases.every(({ id, rule }) =>
      eligibleAt(
        rows.find(row => row.id === id),
        rule,
        decisionAt
      )
    )
  ) {
    return false;
  }
  const sharingBasis = rows.find(row => row.id === input.sharingAuthorityId);
  if (input.sharingAuthorityId && !sharingBasis?.purpose?.trim()) return false;
  const where = registerChildWhere(
    claimAuthorities,
    tenantId,
    input.claimId,
    eq(claimAuthorities.id, input.representationAuthorityId)
  );
  const [rule] = await tx
    .select({
      appropriate: sql<boolean>`public.claim_basis_jurisdiction_appropriate(${claimAuthorities.tenantId}, ${claimAuthorities.claimId}, ${claimAuthorities.id})`,
    })
    .from(claimAuthorities)
    .where(where);
  return rule?.appropriate === true;
}
