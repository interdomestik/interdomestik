'use client';

import { formatNumber } from '@/lib/utils/number';
import type { CaseAuthorityEntry } from '@interdomestik/domain-claims/claims/case-authorities';
import { Button } from '@interdomestik/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useId } from 'react';
import { RegisterSelect, type RegisterDocument } from './case-register-controls';

export type SelectedDocument = RegisterDocument & { confirmedUnlisted?: boolean };

export function ClaimCorrespondenceOutboundFields({
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
