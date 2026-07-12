'use client';

import type { SerializedVaultConsentDisplay } from '@/features/claims/tracking/server/member-vault-consent-serialization';
import { formatPilotDateTime } from '@/lib/utils/date';
import { ShieldCheck } from 'lucide-react';
import { useId } from 'react';
import { useLocale, useTranslations } from 'next-intl';

interface MemberVaultConsentCardProps {
  display: SerializedVaultConsentDisplay;
}

const statusStyles = {
  accepted: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  withdrawn: 'border-amber-200 bg-amber-50 text-amber-900',
  missing: 'border-slate-200 bg-slate-50 text-slate-700',
} as const;

const statusKeys = {
  accepted: 'statusAccepted',
  withdrawn: 'statusWithdrawn',
  missing: 'statusMissing',
} as const;

export function MemberVaultConsentCard({ display }: MemberVaultConsentCardProps) {
  const locale = useLocale();
  const t = useTranslations('claims-tracking.vault_consent');
  const titleId = useId();
  if (display.kind === 'hidden') return null;

  const formatDate = (value: string | null) =>
    value ? formatPilotDateTime(value, locale, t('unavailable')) : t('unavailable');

  return (
    <section
      aria-labelledby={titleId}
      data-testid="member-vault-consent"
      className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <header className="border-b border-slate-100 bg-slate-50/70 px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 rounded-lg bg-teal-100 p-2 text-teal-800" aria-hidden="true">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-slate-950 sm:text-lg">
              {t('title')}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{t('description')}</p>
          </div>
        </div>
      </header>

      <div className="px-4 py-4 sm:px-5">
        {display.kind === 'subject_erased' ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-700">
            {t('erased')}
          </p>
        ) : display.items.length === 0 ? (
          <p className="text-sm text-slate-600">{t('empty')}</p>
        ) : (
          <ul className="space-y-3" role="list">
            {display.items.map((item, index) => (
              <li
                key={`${item.consentStatus}:${item.updatedAt ?? 'unknown'}:${item.consentRecordedAt ?? 'none'}:${index}`}
                className="min-w-0 rounded-lg border border-slate-200 p-4"
              >
                <dl className="grid min-w-0 grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <dt className="sr-only">{t('consentStatusLabel')}</dt>
                    <dd
                      className={`inline-flex max-w-full rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[item.consentStatus]}`}
                    >
                      {t(statusKeys[item.consentStatus])}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">{t('categoryLabel')}</dt>
                    <dd className="mt-1 font-medium text-slate-900">{t('categoryEvidence')}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">{t('metadataUpdatedLabel')}</dt>
                    <dd className="mt-1 break-words font-medium text-slate-900">
                      {formatDate(item.updatedAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">{t('recordedAtLabel')}</dt>
                    <dd className="mt-1 break-words font-medium text-slate-900">
                      {formatDate(item.consentRecordedAt)}
                    </dd>
                  </div>
                  {item.consentStatus === 'accepted' && item.consentVersion ? (
                    <div>
                      <dt className="text-slate-500">{t('versionLabel')}</dt>
                      <dd className="mt-1 break-all font-medium text-slate-900">
                        {item.consentVersion}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
