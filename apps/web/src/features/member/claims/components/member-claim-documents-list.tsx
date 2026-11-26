'use client';

import { OPS_TEST_IDS } from '@/components/ops/testids';
import type { OpsDocument } from '@/components/ops/types';
import { formatPilotDate } from '@/lib/utils/date';
import { FileText } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useId, type ReactNode } from 'react';
import { DETAIL_CARD, DETAIL_HEADING, DETAIL_TERM } from './member-claim-detail-styles';

type MemberClaimDocumentsListProps = Readonly<{
  documents: OpsDocument[];
  uploadAction: ReactNode;
}>;

function toDateTimeAttribute(value: OpsDocument['uploadedAt']) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function MemberClaimDocumentsList({
  documents,
  uploadAction,
}: MemberClaimDocumentsListProps) {
  const t = useTranslations('claims.detail');
  const locale = useLocale();
  const idPrefix = useId();

  return (
    <div className={`${DETAIL_CARD} space-y-5`} data-testid={OPS_TEST_IDS.DOCUMENTS.PANEL}>
      {/* Members read this detail at 320 CSS px, so the upload action wraps under the title. */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h2 className={DETAIL_HEADING}>{t('evidence')}</h2>
        {uploadAction}
      </div>
      {documents.length === 0 ? (
        <p className={DETAIL_TERM} data-testid={OPS_TEST_IDS.DOCUMENTS.EMPTY}>
          {t('documentsEmpty')}
        </p>
      ) : (
        <ul className="grid min-w-0 gap-3">
          {documents.map(document => {
            const nameId = `${idPrefix}-${document.id}`;
            const dateTime = toDateTimeAttribute(document.uploadedAt);
            return (
              <li
                key={document.id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-[hsl(var(--border-strong))] p-3 forced-colors:border-[CanvasText]"
                data-testid={OPS_TEST_IDS.DOCUMENTS.ROW}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <FileText aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium [overflow-wrap:anywhere]" id={nameId}>
                      {document.name}
                    </p>
                    {dateTime ? (
                      <p className={DETAIL_TERM}>
                        {t('documentUploaded')}{' '}
                        <time dateTime={dateTime}>
                          {formatPilotDate(dateTime, locale, dateTime)}
                        </time>
                      </p>
                    ) : null}
                  </div>
                </div>
                {document.url ? (
                  <a
                    aria-describedby={nameId}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-foreground/60 px-4 text-sm font-semibold hover:bg-[hsl(var(--surface-strong))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 forced-colors:border-[CanvasText] forced-colors:focus-visible:outline"
                    href={document.url}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {t('viewDocument')}
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
