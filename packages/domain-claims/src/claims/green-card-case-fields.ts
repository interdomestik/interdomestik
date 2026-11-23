import { and, claimCaseFields, eq, sql, type TenantTransaction } from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { z } from 'zod';
import {
  lockCaseForRegister,
  registerClaimInput,
  registerFailure,
  registerForbidden,
  registerText,
  registerTimestamp,
  resolveRegisterRead,
  resolveRegisterWrite,
  type LockedRegister,
  normalizeRegisterInput,
} from './case-register-access';
import type { ClaimsSession } from './types';

const caseFieldsShape = {
  otherVehicleCountryCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
  insuranceProofReference: registerText(200).nullable(),
  outsideHandlingParty: registerText(200).nullable(),
  coverageVerificationStatus: z.enum([
    'not_checked',
    'requested',
    'confirmed_by_party',
    'refused_by_party',
  ]),
  caseFollowUpAt: registerTimestamp.nullable(),
};

const coverageStatus = caseFieldsShape.coverageVerificationStatus;
const caseFieldsSchema = z.object(caseFieldsShape).strict();

/** `expected` holds the saved values the edit started from; a changed row is a conflict. */
export const updateGreenCardCaseFieldsInputSchema = registerClaimInput.extend({
  ...caseFieldsShape,
  expected: caseFieldsSchema,
});

type CaseFieldsInput = z.infer<typeof updateGreenCardCaseFieldsInputSchema>;
export type GreenCardCaseFields = z.infer<typeof caseFieldsSchema>;
type StoredCaseFields = typeof claimCaseFields.$inferSelect;

/** A claim without a `claim_case_fields` row has these values. */
const defaultCaseFields: GreenCardCaseFields = {
  otherVehicleCountryCode: null,
  insuranceProofReference: null,
  outsideHandlingParty: null,
  coverageVerificationStatus: 'not_checked',
  caseFollowUpAt: null,
};

function isDefault(fields: GreenCardCaseFields) {
  return (
    fields.otherVehicleCountryCode === null &&
    fields.insuranceProofReference === null &&
    fields.outsideHandlingParty === null &&
    fields.coverageVerificationStatus === 'not_checked' &&
    fields.caseFollowUpAt === null
  );
}

function serializeCaseFields(row: StoredCaseFields | undefined): GreenCardCaseFields {
  if (!row) return defaultCaseFields;
  return {
    otherVehicleCountryCode: row.otherVehicleCountryCode,
    insuranceProofReference: row.insuranceProofReference,
    outsideHandlingParty: row.outsideHandlingParty,
    // The column is a database check, not a TypeScript type: parse it (R-20).
    coverageVerificationStatus: coverageStatus.parse(row.coverageVerificationStatus),
    caseFollowUpAt: row.caseFollowUpAt?.toISOString() ?? null,
  };
}

/**
 * Compare-and-set under the claim lock (R-17). Started from the defaults: insert, or update a
 * stored row only while it still holds the defaults. Otherwise: update only while every field
 * still equals the value the editor saw. Zero rows returned is a conflict.
 */
function writeCaseFields({ tx, tenantId, actorId }: LockedRegister, input: CaseFieldsInput) {
  const values = {
    otherVehicleCountryCode: input.otherVehicleCountryCode,
    insuranceProofReference: input.insuranceProofReference,
    outsideHandlingParty: input.outsideHandlingParty,
    coverageVerificationStatus: input.coverageVerificationStatus,
    caseFollowUpAt: input.caseFollowUpAt ? new Date(input.caseFollowUpAt) : null,
    updatedByStaffId: actorId,
    updatedAt: sql`pg_catalog.clock_timestamp()`,
  };
  const expected = input.expected;
  if (isDefault(expected)) {
    return tx
      .insert(claimCaseFields)
      .values({ ...values, tenantId, claimId: input.claimId })
      .onConflictDoUpdate({
        target: [claimCaseFields.tenantId, claimCaseFields.claimId],
        set: values,
        // Qualified: in ON CONFLICT the stored row is named by its table, the proposal by EXCLUDED.
        setWhere: sql`"claim_case_fields"."other_vehicle_country_code" is null
          and "claim_case_fields"."insurance_proof_reference" is null
          and "claim_case_fields"."outside_handling_party" is null
          and "claim_case_fields"."coverage_verification_status" = 'not_checked'
          and "claim_case_fields"."case_follow_up_at" is null`,
      })
      .returning();
  }
  return tx
    .update(claimCaseFields)
    .set(values)
    .where(
      withTenant(
        tenantId,
        claimCaseFields.tenantId,
        and(
          eq(claimCaseFields.claimId, input.claimId),
          sql`${claimCaseFields.otherVehicleCountryCode} is not distinct from ${expected.otherVehicleCountryCode}::text`,
          sql`${claimCaseFields.insuranceProofReference} is not distinct from ${expected.insuranceProofReference}::text`,
          sql`${claimCaseFields.outsideHandlingParty} is not distinct from ${expected.outsideHandlingParty}::text`,
          eq(claimCaseFields.coverageVerificationStatus, expected.coverageVerificationStatus),
          sql`${claimCaseFields.caseFollowUpAt} is not distinct from ${expected.caseFollowUpAt}::timestamptz`
        )
      )
    )
    .returning();
}

async function updateCaseFields(context: LockedRegister, input: CaseFieldsInput) {
  const [row] = await writeCaseFields(context, input);
  if (!row) return { ok: false, code: 'conflict' } as const;
  return { ok: true, fields: serializeCaseFields(row) } as const;
}

export async function updateGreenCardCaseFields(
  session: ClaimsSession | null,
  authority: TenantAuthority | null,
  input: unknown
) {
  const access = resolveRegisterWrite(
    session,
    authority,
    input,
    updateGreenCardCaseFieldsInputSchema
  );
  if (!access.ok) return access;
  const { tenantId, actor } = access;
  const data = normalizeRegisterInput(access.data);
  try {
    return await withTenantAuthority(access.authority, async tx => {
      if (!(await lockCaseForRegister(tx, tenantId, data.claimId, actor))) return registerForbidden;
      return updateCaseFields({ tx, tenantId, actorId: actor.userId }, data);
    });
  } catch (error) {
    return registerFailure(error);
  }
}

export { registerClaimInput as getGreenCardCaseFieldsInputSchema } from './case-register-access';

async function readCaseFields(tx: TenantTransaction, tenantId: string, claimId: string) {
  const [row] = await tx
    .select()
    .from(claimCaseFields)
    .where(withTenant(tenantId, claimCaseFields.tenantId, eq(claimCaseFields.claimId, claimId)));
  return { fields: serializeCaseFields(row) };
}

export async function getGreenCardCaseFields(
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
    return { ...(await readCaseFields(tx, tenantId, data.claimId)), ok: true as const };
  });
}
