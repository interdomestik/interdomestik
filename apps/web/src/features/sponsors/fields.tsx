'use client';

import { Input } from '@interdomestik/ui/components/input';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import type { SponsorOption } from './data.core';

export function Field({
  name,
  type = 'text',
  required = true,
  min,
  max,
  value,
}: {
  name: string;
  type?: string;
  required?: boolean;
  min?: number | string;
  max?: number | string;
  value?: string | number;
}): React.JSX.Element {
  const t = useTranslations('sponsors');
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id}>{t(`fields.${name}`)}</label>
      <Input
        id={id}
        name={name}
        type={type}
        required={required}
        min={min}
        max={max}
        defaultValue={value}
        maxLength={type === 'email' ? 254 : 300}
      />
    </div>
  );
}

export function Choice({
  name,
  options,
}: {
  name: string;
  options: SponsorOption[];
}): React.JSX.Element {
  const t = useTranslations('sponsors');
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id}>{t(`fields.${name}`)}</label>
      <select
        id={id}
        name={name}
        required
        defaultValue=""
        className="w-full rounded-md border bg-background p-2 focus-visible:outline focus-visible:outline-2"
      >
        <option value="" disabled>
          {t('choose')}
        </option>
        {options.map(option => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function RevisionFields({ minimum = 1 }: { minimum?: number }): React.JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field name="seatCount" type="number" min={minimum} max={500} />
      <Field name="pricePerSeatMinor" type="number" min={0} />
      <Field name="currency" value="EUR" />
      <Field name="contractReference" />
      <Field name="termsVersion" />
    </div>
  );
}
