import { parameterFreeFailure } from '@/actions/staff-claims/register-failure';
import { caseRegister } from '@/features/staff/claims/components/StaffClaimCaseRegister';
import {
  getAssignedStaffClaimDocuments,
  getRegisterPickerDocuments,
} from '@/features/staff/claims/server/get-assigned-claim-documents';
import { clampPage } from '@/lib/pagination';
import * as Sentry from '@sentry/nextjs';
import type { getTranslations } from 'next-intl/server';
import { StaffClaimDocumentsSection } from './staff-claim-documents-section';

export type StaffClaimRegisterSearchParams = {
  correspondencePage?: string | string[];
  evidencePage?: string | string[];
};

export function readStaffClaimRegisterPages(query?: StaffClaimRegisterSearchParams) {
  const correspondencePage = clampPage(
    Number(typeof query?.correspondencePage === 'string' ? query.correspondencePage : 1)
  );
  const evidencePage = clampPage(
    Number(typeof query?.evidencePage === 'string' ? query.evidencePage : 1)
  );
  return { correspondencePage, evidencePage };
}

export async function prepareStaffClaimRegister({
  session,
  authority,
  claim,
  claimId,
  locale,
  isAssignedStaff,
  pages: { correspondencePage, evidencePage },
}: {
  session: Parameters<typeof caseRegister>[0];
  authority: Parameters<typeof caseRegister>[1];
  claim: Parameters<typeof caseRegister>[2];
  claimId: string;
  locale: string;
  isAssignedStaff: boolean;
  pages: ReturnType<typeof readStaffClaimRegisterPages>;
}) {
  // The document reader rechecks exact assignment inside its tenant transaction.
  const readDocuments = { claimId, session, authority };
  const [evidence, picker] = isAssignedStaff
    ? await Promise.allSettled([
        getAssignedStaffClaimDocuments({ ...readDocuments, page: evidencePage }),
        getRegisterPickerDocuments(readDocuments),
      ])
    : [null, null];
  if (evidence?.status === 'rejected') {
    Sentry.captureException(parameterFreeFailure(evidence.reason, 'claim evidence read'));
  }
  if (picker?.status === 'rejected') {
    Sentry.captureException(parameterFreeFailure(picker.reason, 'register picker read'));
  }
  const evidenceResult = evidence?.status === 'fulfilled' ? evidence.value : null;
  function evidenceHref(page: number) {
    const params = new URLSearchParams();
    if (correspondencePage > 1) params.set('correspondencePage', String(correspondencePage));
    if (page > 1) params.set('evidencePage', String(page));
    const search = params.size > 0 ? `?${params}` : '';
    return `/${locale}/staff/claims/${encodeURIComponent(claimId)}${search}`;
  }
  const readRegister = () =>
    caseRegister(
      session,
      authority,
      claim,
      picker?.status === 'fulfilled' ? picker.value : null,
      locale,
      correspondencePage,
      evidenceResult?.page ?? evidencePage
    );

  function renderEvidence(
    tEvidence: Awaited<ReturnType<typeof getTranslations<'claims'>>>,
    tCommon: Awaited<ReturnType<typeof getTranslations<'common'>>>
  ) {
    return (
      <StaffClaimDocumentsSection
        documents={evidenceResult?.documents ?? null}
        emptyLabel={tEvidence('detail.documentsEmpty')}
        errorLabel={tCommon('errors.generic')}
        isAssignedStaff={isAssignedStaff}
        nextPage={
          evidenceResult?.hasNextPage
            ? { href: evidenceHref(evidenceResult.page + 1), label: tCommon('next') }
            : undefined
        }
        previousPage={
          evidenceResult && evidenceResult.page > 1
            ? { href: evidenceHref(evidenceResult.page - 1), label: tCommon('previous') }
            : undefined
        }
        retryHref={evidenceHref(evidencePage)}
        retryLabel={tCommon('tryAgain')}
        title={tEvidence('detail.evidence')}
        viewLabel={tEvidence('informationRequests.download')}
      />
    );
  }

  return { readRegister, renderEvidence };
}
