'use client';

import { recordCaseAuthority, revokeCaseAuthority } from '@/actions/staff-claims/case-authorities';
import { formatPilotDateTime } from '@/lib/utils/date';
import type { CaseAuthorityEntry } from '@interdomestik/domain-claims/claims/case-authorities';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';
import {
  formText,
  formTimestamp,
  formValue,
  RegisterFeedback,
  RegisterInput,
  RegisterSelect,
  RegisterSubmit,
  type RegisterDocument,
  useRegisterCorrelation,
  useRegisterMutation,
} from './case-register-controls';

const kinds = [
  'recovery_agreement',
  'power_of_attorney',
  'signed_assignment',
  'consent_or_lawful_basis',
] as const satisfies readonly CaseAuthorityEntry['kind'][];

function RecordAuthorityForm({
  claimId,
  documents,
  availableKinds,
}: Readonly<{
  claimId: string;
  documents: readonly RegisterDocument[];
  availableKinds: readonly CaseAuthorityEntry['kind'][];
}>) {
  const t = useTranslations('staff-correspondence');
  const title = useId();
  const [selected, setSelected] = useState('');
  const kind = availableKinds.find(value => value === selected) ?? availableKinds[0];
  const mutation = useRegisterMutation();
  const correlation = useRegisterCorrelation();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    mutation.run(
      () => {
        const input = {
          claimId,
          kind,
          // The selected document id exactly as listed: never trimmed (opaque id).
          evidenceDocumentId: formValue(data, 'evidenceDocumentId'),
          version: formText(data, 'version'),
          grantedAt: formTimestamp(data, 'grantedAt'),
          expiresAt: formTimestamp(data, 'expiresAt'),
          jurisdictionCountryCode:
            formText(data, 'jurisdictionCountryCode').toUpperCase() || undefined,
          jurisdictionAppropriateConfirmed: data.has('jurisdictionAppropriateConfirmed')
            ? true
            : undefined,
          purpose: formText(data, 'purpose') || undefined,
        };
        return recordCaseAuthority({ ...input, correlationId: correlation.forInput(input) });
      },
      () => {
        correlation.clear();
        form.reset();
        setSelected('');
      }
    );
  }

  return (
    <div className="grid gap-2">
      {documents.length === 0 && <p>{t('documents.empty')}</p>}
      {documents.length > 0 && kind && (
        <form aria-labelledby={title} onSubmit={submit} className="grid gap-3">
          <h3 id={title} className="font-semibold">
            {t('authorities.record')}
          </h3>
          <fieldset disabled={mutation.pending} className="grid min-w-0 gap-3 sm:grid-cols-2">
            <RegisterSelect
              label={t('authorities.kind')}
              name="kind"
              value={kind}
              onChange={event => setSelected(event.currentTarget.value)}
            >
              {availableKinds.map(value => (
                <option key={value} value={value}>
                  {t(`authorities.kinds.${value}`)}
                </option>
              ))}
            </RegisterSelect>
            <RegisterSelect
              label={t('authorities.instrument')}
              name="evidenceDocumentId"
              defaultValue=""
              required
            >
              <option value="" disabled>
                {t('choose')}
              </option>
              {documents.map(document => (
                <option key={document.id} value={document.id}>
                  {document.name}
                </option>
              ))}
            </RegisterSelect>
            <RegisterInput
              label={t('authorities.version')}
              name="version"
              maxLength={50}
              required
            />
            <RegisterInput
              label={t('authorities.grantedUtc')}
              name="grantedAt"
              type="datetime-local"
              required
            />
            <RegisterInput
              label={t('authorities.expiresUtc')}
              name="expiresAt"
              type="datetime-local"
            />
            {kind === 'power_of_attorney' && (
              <>
                <RegisterInput
                  label={t('authorities.jurisdiction')}
                  name="jurisdictionCountryCode"
                  pattern="[A-Za-z]{2}"
                  maxLength={2}
                  required
                />
                <label className="flex min-h-10 items-start gap-2 sm:col-span-2">
                  <input
                    type="checkbox"
                    className="mt-1 size-5 shrink-0"
                    name="jurisdictionAppropriateConfirmed"
                    required
                  />
                  {t('authorities.attestJurisdiction')}
                </label>
              </>
            )}
            {kind === 'consent_or_lawful_basis' && (
              <RegisterInput
                label={t('authorities.purpose')}
                name="purpose"
                maxLength={500}
                required
              />
            )}
          </fieldset>
          <RegisterSubmit pending={mutation.pending}>{t('authorities.record')}</RegisterSubmit>
        </form>
      )}
      <RegisterFeedback {...mutation} />
    </div>
  );
}

function AuthorityRow({
  entry,
  claimId,
  canWrite,
  documentName,
}: Readonly<{
  entry: CaseAuthorityEntry;
  claimId: string;
  canWrite: boolean;
  documentName?: string;
}>) {
  const t = useTranslations('staff-correspondence.authorities');
  const tRegister = useTranslations('staff-correspondence');
  const locale = useLocale();
  const mutation = useRegisterMutation();
  const date = (value: string) => formatPilotDateTime(value, locale, '');

  return (
    <li className="grid gap-1 break-words rounded-md border p-3">
      <h3 className="font-semibold">{t(`kinds.${entry.kind}`)}</h3>
      <p>{t('versionValue', { version: entry.version })}</p>
      <p>
        {documentName ? t('instrumentValue', { name: documentName }) : tRegister('citedDocument')}
      </p>
      <p>{t('granted', { date: date(entry.grantedAt) })}</p>
      {entry.expiresAt && <p>{t('expires', { date: date(entry.expiresAt) })}</p>}
      {entry.jurisdictionCountryCode && (
        <p>{t('jurisdictionValue', { country: entry.jurisdictionCountryCode })}</p>
      )}
      {entry.purpose && <p>{t('purposeValue', { purpose: entry.purpose })}</p>}
      {entry.revokedAt && <p>{t('revoked', { date: date(entry.revokedAt) })}</p>}
      {canWrite && !entry.revokedAt && (
        <form
          onSubmit={event => {
            event.preventDefault();
            mutation.run(() => revokeCaseAuthority({ claimId, authorityId: entry.id }));
          }}
        >
          <details className="space-y-2">
            <summary className="w-fit cursor-pointer rounded px-1 py-2 text-sm font-medium underline focus-visible:outline-2">
              {t('revoke')}
            </summary>
            <p className="text-sm">{t('revokeLimit')}</p>
            <RegisterSubmit pending={mutation.pending}>{t('confirmRevoke')}</RegisterSubmit>
          </details>
        </form>
      )}
      <RegisterFeedback {...mutation} />
    </li>
  );
}

export function ClaimAuthoritiesPanel({
  authorities,
  canWrite,
  claimId,
  documents,
  citedDocuments = [],
}: Readonly<{
  authorities: readonly CaseAuthorityEntry[];
  canWrite: boolean;
  claimId: string;
  documents: readonly RegisterDocument[] | null;
  citedDocuments?: readonly RegisterDocument[];
}>) {
  const t = useTranslations('staff-correspondence.authorities');
  const title = useId();
  const availableKinds = kinds.filter(kind => !authorities.some(entry => entry.kind === kind));
  const names = new Map(citedDocuments.map(document => [document.id, document.name]));

  return (
    <section aria-labelledby={title} className="grid gap-3 rounded-lg border bg-card p-4">
      <h2 id={title} className="text-lg font-semibold">
        {t('title')}
      </h2>
      {authorities.length === 0 ? (
        <p>{t('empty')}</p>
      ) : (
        <ul className="grid gap-2">
          {authorities.map(entry => (
            <AuthorityRow
              key={entry.id}
              entry={entry}
              claimId={claimId}
              canWrite={canWrite}
              documentName={names.get(entry.evidenceDocumentId)}
            />
          ))}
        </ul>
      )}
      {canWrite && documents && (
        <RecordAuthorityForm
          claimId={claimId}
          documents={documents}
          availableKinds={availableKinds}
        />
      )}
    </section>
  );
}
