import 'server-only';

import { listCaseAuthorities } from '@interdomestik/domain-claims/claims/case-authorities';
import {
  getClaimCorrespondenceSummary,
  listClaimCorrespondence,
} from '@interdomestik/domain-claims/claims/correspondence-read';
import { getGreenCardCaseFields } from '@interdomestik/domain-claims/claims/green-card-case-fields';
import * as Sentry from '@sentry/nextjs';
import { unstable_rethrow } from 'next/navigation';

type RegisterReadContext = Pick<Parameters<typeof listClaimCorrespondence>, 0 | 1>;

async function settleRead<T extends object>(read: Promise<T>) {
  try {
    return await read;
  } catch (error) {
    unstable_rethrow(error);
    // The panel shows its error and retry state; the failure itself is recorded (R-08).
    Sentry.captureException(error);
    return { ok: false, code: 'INTERNAL_SERVER_ERROR' } as const;
  }
}

export function readStaffCaseRegister(
  session: RegisterReadContext[0],
  authority: RegisterReadContext[1],
  claimId: string
) {
  const input = { claimId };
  return Promise.all([
    settleRead(getGreenCardCaseFields(session, authority, input)),
    settleRead(listCaseAuthorities(session, authority, input)),
    settleRead(listClaimCorrespondence(session, authority, input)),
  ]);
}

export function readBranchCorrespondenceSummary(
  session: RegisterReadContext[0],
  authority: RegisterReadContext[1],
  claimId: string
) {
  return settleRead(getClaimCorrespondenceSummary(session, authority, { claimId }));
}
