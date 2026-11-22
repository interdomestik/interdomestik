import { and, claims, eq, isNull, type TenantTransaction } from '@interdomestik/database';
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

const caseFieldsSchema = z.object(caseFieldsShape).strict();

/** `expected` holds the saved values the edit started from; a changed row is a conflict. */
export const updateGreenCardCaseFieldsInputSchema = registerClaimInput.extend({
  ...caseFieldsShape,
  expected: caseFieldsSchema,
});

type CaseFieldsInput = z.infer<typeof updateGreenCardCaseFieldsInputSchema>;
export type GreenCardCaseFields = z.infer<typeof caseFieldsSchema>;

const caseFieldsSelection = {
  otherVehicleCountryCode: claims.otherVehicleCountryCode,
  insuranceProofReference: claims.insuranceProofReference,
  outsideHandlingParty: claims.outsideHandlingParty,
  coverageVerificationStatus: claims.coverageVerificationStatus,
  caseFollowUpAt: claims.caseFollowUpAt,
};

function serializeCaseFields(
  row: Omit<GreenCardCaseFields, 'caseFollowUpAt'> & { caseFollowUpAt: Date | null }
): GreenCardCaseFields {
  return { ...row, caseFollowUpAt: row.caseFollowUpAt?.toISOString() ?? null };
}

function toDate(value: string | null) {
  return value ? new Date(value) : null;
}

function nullableEquals<T>(column: Parameters<typeof eq>[0], value: T | null) {
  return value === null ? isNull(column) : eq(column, value);
}

/** The saved state the editor saw, repeated as the update condition (R-17). */
function unchangedSince(expected: GreenCardCaseFields) {
  return and(
    nullableEquals(claims.otherVehicleCountryCode, expected.otherVehicleCountryCode),
    nullableEquals(claims.insuranceProofReference, expected.insuranceProofReference),
    nullableEquals(claims.outsideHandlingParty, expected.outsideHandlingParty),
    eq(claims.coverageVerificationStatus, expected.coverageVerificationStatus),
    nullableEquals(claims.caseFollowUpAt, toDate(expected.caseFollowUpAt))
  );
}

async function updateCaseFields({ tx, tenantId }: LockedRegister, input: CaseFieldsInput) {
  const [row] = await tx
    .update(claims)
    .set({
      otherVehicleCountryCode: input.otherVehicleCountryCode,
      insuranceProofReference: input.insuranceProofReference,
      outsideHandlingParty: input.outsideHandlingParty,
      coverageVerificationStatus: input.coverageVerificationStatus,
      caseFollowUpAt: toDate(input.caseFollowUpAt),
    })
    .where(
      withTenant(
        tenantId,
        claims.tenantId,
        and(eq(claims.id, input.claimId), unchangedSince(input.expected))
      )
    )
    .returning(caseFieldsSelection);
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
  const { tenantId, actor, data } = access;
  try {
    return await withTenantAuthority(access.authority, async tx => {
      if (!(await lockCaseForRegister(tx, tenantId, data.claimId, actor))) return registerForbidden;
      return updateCaseFields({ tx, tenantId, actorId: actor.userId }, data);
    });
  } catch (error) {
    return registerFailure(error);
  }
}

export const getGreenCardCaseFieldsInputSchema = registerClaimInput;

async function readCaseFields(tx: TenantTransaction, tenantId: string, claimId: string) {
  const [row] = await tx
    .select(caseFieldsSelection)
    .from(claims)
    .where(withTenant(tenantId, claims.tenantId, eq(claims.id, claimId)));
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
