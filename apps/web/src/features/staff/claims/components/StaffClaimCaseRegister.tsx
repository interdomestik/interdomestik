import {
  readBranchCorrespondenceSummary,
  readStaffCaseRegister,
} from '@/actions/staff-claims/case-register-read';
import { deniesClaimMessageContent } from '@/lib/branch-manager-message-boundary';
import { formatPilotDateTime } from '@/lib/utils/date';
import { formatNumber } from '@/lib/utils/number';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { ClaimAuthoritiesPanel } from './ClaimAuthoritiesPanel';
import { ClaimCaseFieldsPanel } from './ClaimCaseFieldsPanel';
import { ClaimCorrespondenceForm } from './ClaimCorrespondenceForm';
import { ClaimCorrespondenceList } from './ClaimCorrespondenceList';
import { ClaimRegisterDocumentUpload } from './ClaimRegisterDocumentUpload';
import { RegisterReadError, type RegisterDocument } from './case-register-controls';

type RegisterProps = Readonly<{
  claimId: string;
  locale: string;
  session: Parameters<typeof readStaffCaseRegister>[0];
  authority: Parameters<typeof readStaffCaseRegister>[1];
  canWrite: boolean;
  restricted: boolean;
  documents: readonly RegisterDocument[] | null;
  correspondencePage: number;
}>;

async function BranchSummary({ claimId, locale, session, authority }: RegisterProps) {
  const [result, t] = await Promise.all([
    readBranchCorrespondenceSummary(session, authority, claimId),
    getTranslations({ locale, namespace: 'staff-correspondence.summary' }),
  ]);

  return (
    <section
      aria-labelledby="staff-correspondence-summary"
      className="grid gap-2 rounded-lg border p-4"
    >
      <h2 id="staff-correspondence-summary" className="text-lg font-semibold">
        {t('title')}
      </h2>
      {result.ok ? (
        <>
          <p>{t('total', { total: formatNumber(result.summary.total, locale) ?? '' })}</p>
          {result.summary.total > result.summary.dates.length && (
            <p className="text-sm text-muted-foreground">
              {t('latest', {
                shown: formatNumber(result.summary.dates.length, locale) ?? '',
                total: formatNumber(result.summary.total, locale) ?? '',
              })}
            </p>
          )}
          <ul className="ms-5 list-disc">
            {result.summary.dates.map((date, index) => (
              <li key={`${date}-${index}`}>
                <time dateTime={date}>{formatPilotDateTime(date, locale, '')}</time>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <RegisterReadError code={result.code} />
      )}
    </section>
  );
}

async function StaffRegister({
  session,
  authority,
  claimId,
  canWrite,
  documents,
  correspondencePage,
}: RegisterProps) {
  const [caseFields, authorities, correspondence] = await readStaffCaseRegister(
    session,
    authority,
    claimId,
    correspondencePage
  );
  const documentOptions = documents ?? [];

  return (
    <>
      {caseFields.ok ? (
        <ClaimCaseFieldsPanel claimId={claimId} fields={caseFields.fields} canWrite={canWrite} />
      ) : (
        <RegisterReadError code={caseFields.code} />
      )}
      {canWrite && authorities.ok && <ClaimRegisterDocumentUpload claimId={claimId} />}
      {authorities.ok ? (
        <ClaimAuthoritiesPanel
          claimId={claimId}
          authorities={authorities.authorities}
          canWrite={canWrite}
          documents={documents}
        />
      ) : (
        <RegisterReadError code={authorities.code} />
      )}
      {correspondence.ok ? (
        <ClaimCorrespondenceList
          claimId={claimId}
          entries={correspondence.entries}
          page={correspondence.page}
          perPage={correspondence.perPage}
          total={correspondence.total}
          canWrite={canWrite}
          documents={documentOptions}
        />
      ) : (
        <RegisterReadError code={correspondence.code} />
      )}
      {canWrite && correspondence.ok && (
        <ClaimCorrespondenceForm
          claimId={claimId}
          authorities={authorities.ok ? authorities.authorities : []}
          documents={documentOptions}
          entries={correspondence.entries}
        />
      )}
    </>
  );
}

export async function caseRegister(
  session: NonNullable<RegisterProps['session']>,
  authority: NonNullable<RegisterProps['authority']>,
  claim: { id: string; staffId: string | null },
  documents: RegisterProps['documents'],
  locale: string,
  correspondencePage = 1
) {
  const t = await getTranslations({ locale, namespace: 'staff-correspondence.feedback' });
  const props: RegisterProps = {
    claimId: claim.id,
    session,
    authority,
    locale,
    canWrite: session.user.role === 'staff' && claim.staffId === session.user.id,
    restricted: deniesClaimMessageContent(session.user.role),
    documents: documents?.map(({ id, name }) => ({ id, name })) ?? null,
    correspondencePage,
  };
  return (
    <div className="min-w-0 space-y-4" data-testid="staff-case-register">
      <Suspense fallback={<p aria-live="polite">{t('loading')}</p>}>
        {props.restricted ? <BranchSummary {...props} /> : <StaffRegister {...props} />}
      </Suspense>
    </div>
  );
}
