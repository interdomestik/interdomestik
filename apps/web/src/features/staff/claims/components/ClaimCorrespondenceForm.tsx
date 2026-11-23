'use client';

import {
  recordInboundCorrespondence,
  recordOutboundCorrespondence,
} from '@/actions/staff-claims/correspondence';
import { formatPilotDateTime } from '@/lib/utils/date';
import { formatNumber } from '@/lib/utils/number';
import type { CaseAuthorityEntry } from '@interdomestik/domain-claims/claims/case-authorities';
import type { ClaimCorrespondenceEntry } from '@interdomestik/domain-claims/claims/correspondence-read';
import { Button, Textarea } from '@interdomestik/ui';
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
type SelectedDocument = RegisterDocument & { confirmedUnlisted?: boolean };

function OutboundFields({
  authorities,
  documents,
  maxSharedDocuments,
  selectedDocuments,
  unlistedDocuments,
  setSelectedDocuments,
}: Readonly<{
  authorities: readonly CaseAuthorityEntry[];
  documents: readonly RegisterDocument[];
  maxSharedDocuments: number;
  selectedDocuments: SelectedDocument[];
  unlistedDocuments: SelectedDocument[];
  setSelectedDocuments: (selection: SelectedDocument[]) => void;
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
      {(documents.length > 0 || unlistedDocuments.length > 0) && (
        <fieldset
          className="grid min-w-0 gap-1 rounded-md border p-3 sm:col-span-2"
          aria-describedby={pickerHint}
        >
          <legend className="px-1 text-sm font-medium">{t('entry.documents')}</legend>
          <p id={pickerHint} className="text-sm">
            {t('entry.documentLimit', { limit: formatNumber(maxSharedDocuments, locale) ?? '' })}
          </p>
          {documents.map(document => {
            const checked = selectedDocuments.some(selected => selected.id === document.id);
            return (
              <label
                key={document.id}
                className="flex min-h-10 items-center gap-2 break-all text-sm"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && selectedDocuments.length >= maxSharedDocuments}
                  className="size-5 shrink-0"
                  onChange={() =>
                    setSelectedDocuments(
                      checked
                        ? selectedDocuments.filter(selected => selected.id !== document.id)
                        : [...selectedDocuments, document]
                    )
                  }
                />
                {document.name}
              </label>
            );
          })}
          <div aria-live="polite" className="grid gap-2">
            {unlistedDocuments.map(document => (
              <fieldset key={document.id} className="min-w-0 rounded-md border p-2 text-sm">
                <legend className="break-all px-1">
                  {t('entry.unlistedDocument', { name: document.name })}
                </legend>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <label className="flex min-h-10 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={document.confirmedUnlisted ?? false}
                      className="size-5 shrink-0"
                      onChange={event => {
                        const confirmedUnlisted = event.currentTarget.checked;
                        setSelectedDocuments(
                          selectedDocuments.map(selected =>
                            selected.id === document.id
                              ? { ...selected, confirmedUnlisted }
                              : selected
                          )
                        );
                      }}
                    />
                    {t('entry.keepUnlistedDocument')}
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setSelectedDocuments(
                        selectedDocuments.filter(selected => selected.id !== document.id)
                      )
                    }
                  >
                    {t('entry.removeUnlistedDocument')}
                  </Button>
                </div>
              </fieldset>
            ))}
          </div>
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
  const [selectedDocuments, setSelectedDocuments] = useState<SelectedDocument[]>([]);
  const mutation = useRegisterMutation();
  const correlation = useRegisterCorrelation();
  const outbound = entries.filter(entry => entry.direction === 'outbound');
  const unlistedDocuments = selectedDocuments.filter(
    selected => !documents.some(document => document.id === selected.id)
  );
  const hasUnresolvedSelection = unlistedDocuments.some(document => !document.confirmedUnlisted);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (hasUnresolvedSelection) return;
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
      const input = {
        ...common,
        recoveryAuthorityId: formText(data, 'recoveryAuthorityId'),
        representationAuthorityId: formText(data, 'representationAuthorityId'),
        sharingAuthorityId: formText(data, 'sharingAuthorityId') || undefined,
        sharingCoveredByConsentConfirmed: data.has('sharingCoveredByConsentConfirmed')
          ? true
          : undefined,
        sharedDocumentIds: selectedDocuments.map(document => document.id).sort(),
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
              selectedDocuments={selectedDocuments}
              unlistedDocuments={unlistedDocuments}
              setSelectedDocuments={setSelectedDocuments}
            />
          )}
        </fieldset>
        <RegisterSubmit pending={mutation.pending} disabled={hasUnresolvedSelection}>
          {t('entry.record')}
        </RegisterSubmit>
        <RegisterFeedback {...mutation} />
      </form>
    </section>
  );
}
