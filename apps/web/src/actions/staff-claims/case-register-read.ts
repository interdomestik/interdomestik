import 'server-only';

import { listCaseAuthorities } from '@interdomestik/domain-claims/claims/case-authorities';
import {
  getClaimCorrespondenceSummary,
  listClaimCorrespondence,
  listRegisterCitationNames,
} from '@interdomestik/domain-claims/claims/correspondence-read';
import { getGreenCardCaseFields } from '@interdomestik/domain-claims/claims/green-card-case-fields';
import * as Sentry from '@sentry/nextjs';
import { clampPage } from '@/lib/pagination';
import { parameterFreeFailure } from './register-failure';

type RegisterReadContext = Pick<Parameters<typeof listClaimCorrespondence>, 0 | 1>;

async function settleRead<T extends object>(read: Promise<T>) {
  try {
    return await read;
  } catch (error) {
    // The panel shows its error and retry state; the failure itself is recorded (R-08), without
    // the query parameters a database exception can carry.
    Sentry.captureException(parameterFreeFailure(error, 'case register read'));
    return { ok: false, code: 'INTERNAL_SERVER_ERROR' } as const;
  }
}

/** Register entries per page of the staff case page. */
export const REGISTER_PAGE_SIZE = 20;

export async function readStaffCaseRegister(
  session: RegisterReadContext[0],
  authority: RegisterReadContext[1],
  claimId: string,
  correspondencePage = 1
) {
  const input = { claimId };
  const page = { claimId, page: clampPage(correspondencePage), perPage: REGISTER_PAGE_SIZE };
  const [fields, authorities, correspondence] = await Promise.all([
    settleRead(getGreenCardCaseFields(session, authority, input)),
    // At most one row per authority kind (a unique key), so this list needs no page.
    settleRead(listCaseAuthorities(session, authority, input)),
    settleRead(listClaimCorrespondence(session, authority, page)),
  ]);
  const documentIds = [
    ...new Set([
      ...(authorities.ok ? authorities.authorities.map(entry => entry.evidenceDocumentId) : []),
      ...(correspondence.ok
        ? correspondence.entries.flatMap(entry => [
            ...entry.sharedDocumentIds,
            ...(entry.receivedDocumentIds ?? []),
          ])
        : []),
    ]),
  ];
  const citationNames =
    documentIds.length > 0
      ? await settleRead(listRegisterCitationNames(session, authority, { claimId, documentIds }))
      : { ok: true as const, documents: [] };
  return [fields, authorities, correspondence, citationNames] as const;
}

export function readBranchCorrespondenceSummary(
  session: RegisterReadContext[0],
  authority: RegisterReadContext[1],
  claimId: string
) {
  return settleRead(getClaimCorrespondenceSummary(session, authority, { claimId }));
}
