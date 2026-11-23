'use client';

import {
  recordInboundCorrespondence,
  recordOutboundCorrespondence,
} from '@/actions/staff-claims/correspondence';
import { formatPilotDateTime } from '@/lib/utils/date';
import { formatNumber } from '@/lib/utils/number';
import type { CaseAuthorityEntry } from '@interdomestik/domain-claims/claims/case-authorities';
import type { ClaimCorrespondenceEntry } from '@interdomestik/domain-claims/claims/correspondence-read';
import { Textarea } from '@interdomestik/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';
import {
  RegisterFeedback,
  RegisterInput,
  RegisterSelect,
  RegisterSubmit,
  formText,
  formTimestamp,
  useRegisterCorrelation,
  useRegisterMutation,
  type RegisterDocument,
} from './case-register-controls';

const parties = ['insurer', 'bureau', 'other'] as const;
const channels = ['email', 'post', 'phone', 'portal', 'other'] as const;

function OutboundFields({
  authorities,
  documents,
  maxSharedDocuments,
  selectedDocuments,
  setSelectedDocuments,
}: Readonly<{
  authorities: readonly CaseAuthorityEntry[];
  documents: readonly RegisterDocument[];
  maxSharedDocuments: number;
  selectedDocuments: string[];
  setSelectedDocuments: (ids: string[]) => void;
}>) {
  const t = useTranslations('staff-correspondence');
  const locale = useLocale();
  const pickerHint = useId();
  const active = authorities.filter(entry => !entry.revokedAt);
  const recovery = active.find(entry => entry.kind === 'recovery_agreement');
  const representation = active.find(entry => entry.kind === 'power_of_attorney');
  const consent = active.find(entry => entry.kind === 'consent_or_lawful_basis');

  return (
    <>
      <RegisterSelect
        name="recoveryAuthorityId"
        label={t('authorities.kinds.recovery_agreement')}
        defaultValue=""
        required
      >
        <option value="" disabled>
          {t('choose')}
        </option>
        {recovery && <option value={recovery.id}>{recovery.version}</option>}
      </RegisterSelect>
      <RegisterSelect
        name="representationAuthorityId"
        label={t('authorities.kinds.power_of_attorney')}
        defaultValue=""
        required
      >
        <option value="" disabled>
          {t('choose')}
        </option>
        {representation && <option value={representation.id}>{representation.version}</option>}
      </RegisterSelect>
      {(!recovery || !representation) && (
        <p className="text-sm sm:col-span-2">{t('entry.basesRequired')}</p>
      )}
      {documents.length > 0 && (
        <fieldset
          className="grid min-w-0 gap-1 rounded-md border p-3 sm:col-span-2"
          aria-describedby={pickerHint}
        >
          <legend className="px-1 text-sm font-medium">{t('entry.documents')}</legend>
          <p id={pickerHint} className="text-sm">
            {t('entry.documentLimit', { limit: formatNumber(maxSharedDocuments, locale) ?? '' })}
          </p>
          {documents.map(document => {
            const checked = selectedDocuments.includes(document.id);
            return (
              <label
                key={document.id}
                className="flex min-h-10 items-center gap-2 break-all text-sm"
              >
                <input
                  type="checkbox"
                  name="sharedDocumentIds"
                  value={document.id}
                  checked={checked}
                  disabled={!checked && selectedDocuments.length >= maxSharedDocuments}
                  className="size-5 shrink-0"
                  onChange={() =>
                    setSelectedDocuments(
                      checked
                        ? selectedDocuments.filter(id => id !== document.id)
                        : [...selectedDocuments, document.id]
                    )
                  }
                />
                {document.name}
              </label>
            );
          })}
        </fieldset>
      )}
      {selectedDocuments.length > 0 && (
        <>
          <RegisterSelect
            name="sharingAuthorityId"
            label={t('authorities.kinds.consent_or_lawful_basis')}
            defaultValue=""
            required
          >
            <option value="" disabled>
              {t('choose')}
            </option>
            {consent && <option value={consent.id}>{consent.version}</option>}
          </RegisterSelect>
          {consent?.purpose && (
            <p className="break-words text-sm">
              {t('authorities.purposeValue', { purpose: consent.purpose })}
            </p>
          )}
          {!consent && <p className="text-sm">{t('entry.consentRequired')}</p>}
          <label className="flex min-h-10 items-start gap-2 sm:col-span-2">
            <input
              type="checkbox"
              name="sharingCoveredByConsentConfirmed"
              className="mt-1 size-5 shrink-0"
              required
            />
            {t('entry.attestSharing')}
          </label>
        </>
      )}
    </>
  );
}

export function ClaimCorrespondenceForm({
  claimId,
  authorities,
  documents,
  entries,
  maxSharedDocuments,
}: Readonly<{
  claimId: string;
  authorities: readonly CaseAuthorityEntry[];
  documents: readonly RegisterDocument[];
  entries: readonly ClaimCorrespondenceEntry[];
  maxSharedDocuments: number;
}>) {
  const t = useTranslations('staff-correspondence');
  const title = useId();
  const locale = useLocale();
  const [direction, setDirection] = useState('inbound');
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const mutation = useRegisterMutation();
  const correlation = useRegisterCorrelation();
  const outbound = entries.filter(entry => entry.direction === 'outbound');
  const visibleSelection = selectedDocuments.filter(id => documents.some(doc => doc.id === id));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const save = () => {
      const common = {
        claimId,
        partyKind: formText(data, 'partyKind'),
        partyOrganisation: formText(data, 'partyOrganisation'),
        partyReference: formText(data, 'partyReference') || null,
        partyContactName: formText(data, 'partyContactName') || null,
        channel: formText(data, 'channel'),
        occurredAt: formTimestamp(data, 'occurredAt'),
        body: formText(data, 'body'),
      };
      if (direction === 'inbound') {
        const input = { ...common, inReplyToId: formText(data, 'inReplyToId') || null };
        return recordInboundCorrespondence({
          ...input,
          correlationId: correlation.forInput(input),
        });
      }
      const sharedDocumentIds = data.getAll('sharedDocumentIds');
      const input = {
        ...common,
        recoveryAuthorityId: formText(data, 'recoveryAuthorityId'),
        representationAuthorityId: formText(data, 'representationAuthorityId'),
        sharingAuthorityId: formText(data, 'sharingAuthorityId') || undefined,
        sharingCoveredByConsentConfirmed: data.has('sharingCoveredByConsentConfirmed')
          ? true
          : undefined,
        sharedDocumentIds,
      };
      return recordOutboundCorrespondence({ ...input, correlationId: correlation.forInput(input) });
    };
    mutation.run(save, () => {
      correlation.clear();
      form.reset();
      setSelectedDocuments([]);
    });
  }

  return (
    <section aria-labelledby={title} className="rounded-lg border bg-card p-4">
      <h2 id={title} className="mb-3 text-lg font-semibold">
        {t('entry.title')}
      </h2>
      <form onSubmit={submit} aria-labelledby={title} className="grid gap-3">
        <fieldset disabled={mutation.pending} className="grid min-w-0 gap-3 sm:grid-cols-2">
          <RegisterSelect
            label={t('entry.directionLabel')}
            name="direction"
            value={direction}
            onChange={event => {
              setDirection(event.currentTarget.value);
              setSelectedDocuments([]);
            }}
          >
            <option value="inbound">{t('direction.inbound')}</option>
            <option value="outbound">{t('direction.outbound')}</option>
          </RegisterSelect>
          <RegisterInput
            label={t('entry.occurredUtc')}
            name="occurredAt"
            type="datetime-local"
            required
          />
          <RegisterSelect label={t('entry.partyKind')} name="partyKind">
            {parties.map(value => (
              <option key={value} value={value}>
                {t(`party.${value}`)}
              </option>
            ))}
          </RegisterSelect>
          <RegisterInput
            label={t('entry.organisation')}
            name="partyOrganisation"
            maxLength={200}
            required
          />
          <RegisterInput label={t('entry.reference')} name="partyReference" maxLength={200} />
          <RegisterInput label={t('entry.contact')} name="partyContactName" maxLength={200} />
          <RegisterSelect label={t('entry.channel')} name="channel">
            {channels.map(value => (
              <option key={value} value={value}>
                {t(`channel.${value}`)}
              </option>
            ))}
          </RegisterSelect>
          {direction === 'inbound' && outbound.length > 0 && (
            <RegisterSelect label={t('entry.replyTo')} name="inReplyToId" defaultValue="">
              <option value="">{t('entry.noReply')}</option>
              {outbound.map(entry => (
                <option key={entry.id} value={entry.id}>
                  {t('entry.replyOption', {
                    organisation: entry.partyOrganisation,
                    date: formatPilotDateTime(entry.occurredAt, locale, ''),
                    summary: entry.body.slice(0, 80),
                  })}
                </option>
              ))}
            </RegisterSelect>
          )}
          <label className="grid min-w-0 gap-1 text-sm font-medium sm:col-span-2">
            {t('entry.body')}
            <Textarea name="body" rows={4} maxLength={4000} required />
          </label>
          {direction === 'outbound' && (
            <OutboundFields
              authorities={authorities}
              documents={documents}
              maxSharedDocuments={maxSharedDocuments}
              selectedDocuments={visibleSelection}
              setSelectedDocuments={setSelectedDocuments}
            />
          )}
        </fieldset>
        <RegisterSubmit pending={mutation.pending}>{t('entry.record')}</RegisterSubmit>
        <RegisterFeedback {...mutation} />
      </form>
    </section>
  );
}
