'use client';

import { updateGreenCardCaseFields } from '@/actions/staff-claims/case-authorities';
import { formatPilotDateTime } from '@/lib/utils/date';
import type { GreenCardCaseFields } from '@interdomestik/domain-claims/claims/green-card-case-fields';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';
import {
  RegisterFeedback,
  RegisterInput,
  RegisterSelect,
  RegisterSubmit,
  formText,
  formTimestamp,
  useRegisterMutation,
  utcInputValue,
} from './case-register-controls';

const statuses = ['not_checked', 'requested', 'confirmed_by_party', 'refused_by_party'] as const;

function editableFields(fields: GreenCardCaseFields) {
  return {
    otherVehicleCountryCode: fields.otherVehicleCountryCode ?? '',
    insuranceProofReference: fields.insuranceProofReference ?? '',
    outsideHandlingParty: fields.outsideHandlingParty ?? '',
    coverageVerificationStatus: fields.coverageVerificationStatus,
    caseFollowUpAt: utcInputValue(fields.caseFollowUpAt),
  };
}

export function ClaimCaseFieldsPanel({
  canWrite,
  claimId,
  fields,
}: Readonly<{ canWrite: boolean; claimId: string; fields: GreenCardCaseFields }>) {
  const t = useTranslations('staff-correspondence');
  const locale = useLocale();
  const title = useId();
  const mutation = useRegisterMutation();
  const revision = JSON.stringify([
    claimId,
    fields.otherVehicleCountryCode,
    fields.insuranceProofReference,
    fields.outsideHandlingParty,
    fields.coverageVerificationStatus,
    fields.caseFollowUpAt,
  ]);
  const [form, setForm] = useState(() => ({
    revision,
    expected: fields,
    values: editableFields(fields),
  }));
  if (form.revision !== revision) {
    setForm({ revision, expected: fields, values: editableFields(fields) });
  }

  function bind(name: keyof GreenCardCaseFields) {
    return {
      name,
      value: form.values[name],
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const value = event.currentTarget.value;
        setForm(previous => ({ ...previous, values: { ...previous.values, [name]: value } }));
      },
    };
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    mutation.run(() =>
      updateGreenCardCaseFields({
        claimId,
        otherVehicleCountryCode: formText(data, 'otherVehicleCountryCode').toUpperCase() || null,
        insuranceProofReference: formText(data, 'insuranceProofReference') || null,
        outsideHandlingParty: formText(data, 'outsideHandlingParty') || null,
        coverageVerificationStatus: formText(data, 'coverageVerificationStatus'),
        caseFollowUpAt: formTimestamp(data, 'caseFollowUpAt'),
        expected: form.expected,
      })
    );
  }

  const savedFields = {
    country: fields.otherVehicleCountryCode,
    insurance: fields.insuranceProofReference,
    outsideParty: fields.outsideHandlingParty,
    coverage: t(`caseFields.status.${fields.coverageVerificationStatus}`),
    caseFollowUp: formatPilotDateTime(fields.caseFollowUpAt, locale, t('notRecorded')),
  };

  return (
    <section aria-labelledby={title} className="space-y-3 rounded-lg border bg-card p-4">
      <h2 id={title} className="text-lg font-semibold">
        {t('caseFields.title')}
      </h2>
      {canWrite ? (
        <form onSubmit={submit} aria-labelledby={title} className="grid gap-3">
          <fieldset disabled={mutation.pending} className="grid min-w-0 gap-3 sm:grid-cols-2">
            <RegisterInput
              label={t('caseFields.country')}
              {...bind('otherVehicleCountryCode')}
              pattern="[A-Za-z]{2}"
              maxLength={2}
            />
            <RegisterInput
              label={t('caseFields.insurance')}
              {...bind('insuranceProofReference')}
              maxLength={200}
            />
            <RegisterInput
              label={t('caseFields.outsideParty')}
              {...bind('outsideHandlingParty')}
              maxLength={200}
            />
            <RegisterSelect
              label={t('caseFields.coverage')}
              {...bind('coverageVerificationStatus')}
            >
              {statuses.map(status => (
                <option key={status} value={status}>
                  {t(`caseFields.status.${status}`)}
                </option>
              ))}
            </RegisterSelect>
            <RegisterInput
              label={t('caseFields.caseFollowUpUtc')}
              {...bind('caseFollowUpAt')}
              type="datetime-local"
              step="any"
            />
          </fieldset>
          <RegisterSubmit pending={mutation.pending}>{t('caseFields.save')}</RegisterSubmit>
          <RegisterFeedback {...mutation} />
        </form>
      ) : (
        <dl className="grid gap-3 break-words sm:grid-cols-2">
          {Object.entries(savedFields).map(([key, value]) => (
            <div key={key}>
              <dt className="text-sm font-medium">{t(`caseFields.${key}`)}</dt>
              <dd>{value ?? t('notRecorded')}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
