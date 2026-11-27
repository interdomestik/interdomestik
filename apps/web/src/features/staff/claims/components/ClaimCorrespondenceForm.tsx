'use client';

import {
  recordInboundCorrespondence,
  recordOutboundCorrespondence,
} from '@/actions/staff-claims/correspondence';
import { formatPilotDateTime } from '@/lib/utils/date';
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
import {
  ClaimCorrespondenceOutboundFields,
  type SelectedDocument,
} from './ClaimCorrespondenceOutboundFields';

import { ClaimReceivedDocumentPicker } from './ClaimReceivedDocumentPicker';

const parties = ['insurer', 'bureau', 'other'] as const;
const channels = ['email', 'post', 'phone', 'portal', 'other'] as const;

export function ClaimCorrespondenceForm({
  claimId,
  authorities,
  documents,
  entries,
  maxSharedDocuments,
  inboundPilot = false,
}: Readonly<{
  claimId: string;
  authorities: readonly CaseAuthorityEntry[];
  documents: readonly RegisterDocument[];
  entries: readonly ClaimCorrespondenceEntry[];
  maxSharedDocuments: number;
  inboundPilot?: boolean;
}>) {
  const t = useTranslations('staff-correspondence');
  const title = useId();
  const locale = useLocale();
  const [direction, setDirection] = useState('inbound');
  const [selectedDocuments, setSelectedDocuments] = useState<SelectedDocument[]>([]);
  const [receivedDocuments, setReceivedDocuments] = useState<RegisterDocument[]>([]);
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
        const receivedDocumentIds = receivedDocuments
          .map(document => document.id)
          .sort((left, right) => Number(left > right) - Number(left < right));
        const input = {
          ...common,
          inReplyToId: formText(data, 'inReplyToId') || null,
          ...(receivedDocumentIds.length ? { receivedDocumentIds } : {}),
        };
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
        // A stable order keeps the correlation id for an identical retry.
        sharedDocumentIds: selectedDocuments
          .map(document => document.id)
          .sort((left, right) => Number(left > right) - Number(left < right)),
      };
      return recordOutboundCorrespondence({ ...input, correlationId: correlation.forInput(input) });
    };
    mutation.run(save, () => {
      correlation.clear();
      form.reset();
      setSelectedDocuments([]);
      setReceivedDocuments([]);
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
          {direction === 'inbound' && inboundPilot && (
            <ClaimReceivedDocumentPicker
              claimId={claimId}
              selection={receivedDocuments}
              onSelectionChange={setReceivedDocuments}
            />
          )}
          {direction === 'outbound' && (
            <ClaimCorrespondenceOutboundFields
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
