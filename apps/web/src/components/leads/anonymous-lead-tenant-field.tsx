'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import type {
  ClassificationIssue,
  PublicOnboardingTenant,
} from '@/lib/tenant/anonymous-lead-classification';

export type AnonymousLeadTenantProps = Readonly<{
  tenantOptions?: readonly PublicOnboardingTenant[];
  bookingHints?: readonly string[];
}>;

export function AnonymousLeadTenantField({
  tenantOptions = [],
  bookingHints = [],
  disabled,
  issue,
  onChoice,
}: AnonymousLeadTenantProps &
  Readonly<{
    disabled?: boolean;
    issue?: ClassificationIssue;
    onChoice?: (choice: string) => void;
  }>) {
  const t = useTranslations('common.anonymousLead');
  const id = useId();
  const [choice, setChoice] = useState('');
  const unavailable = tenantOptions.length === 0;
  const error = unavailable ? 'unavailable' : issue;
  return (
    <div className="space-y-2 md:col-span-2">
      <label htmlFor={id} className="text-sm font-medium">
        {t('label')}
      </label>
      <select
        id={id}
        name="onboardingTenant"
        value={choice}
        disabled={disabled || unavailable}
        required={bookingHints.length === 0}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={event => {
          setChoice(event.target.value);
          onChoice?.(event.target.value);
        }}
        className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <option value="">{t('placeholder')}</option>
        {tenantOptions.map(tenantId => (
          <option key={tenantId} value={tenantId}>
            {t(`tenants.${tenantId}`)}
          </option>
        ))}
      </select>
      {bookingHints.map((hint, index) => (
        <input
          key={`${index}:${hint}`}
          type="hidden"
          name="default_booking_tenant_id"
          value={hint}
        />
      ))}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-red-600">
          {t(error)}
        </p>
      )}
    </div>
  );
}
