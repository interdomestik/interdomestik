'use client';

import { caseSummaryStatusPillClass } from '@/components/dashboard/case-summary/accident-case-summary';
import type { OpsActionConfig } from '@/components/ops/adapters/claims';
import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui';
import { ArrowLeft, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ClaimEvidenceUploadDialog } from './ClaimEvidenceUploadDialog';
import type { MemberClaimDetailOpsClaim } from './member-claim-detail-types';
import {
  DETAIL_BUTTON,
  DETAIL_DIVIDER,
  DETAIL_HEADER_CARD,
  DETAIL_OUTLINE_BUTTON,
  DETAIL_QUIET_LINK,
  DETAIL_TERM,
} from './member-claim-detail-styles';

export const MEMBER_CLAIM_DETAIL_SECTION_IDS = Object.freeze({
  progress: 'member-claim-detail-progress',
  evidence: 'member-claim-detail-evidence',
  history: 'member-claim-detail-history',
  messaging: 'member-claim-detail-messaging',
} as const);

type BoundOpsActionConfig = OpsActionConfig & { onClick: () => void };

interface MemberClaimDetailHeaderProps {
  claimId: string;
  title: string;
  status: MemberClaimDetailOpsClaim['status'];
  localizedStatusLabel: string;
  uploadAction?: OpsActionConfig;
  secondaryActions: BoundOpsActionConfig[];
}

export function MemberClaimDetailHeader({
  claimId,
  title,
  status,
  localizedStatusLabel,
  uploadAction,
  secondaryActions,
}: Readonly<MemberClaimDetailHeaderProps>) {
  const t = useTranslations('claims.detail.continuity');
  // Section links follow the task-first page reading order.
  const sectionLinks = [
    { id: MEMBER_CLAIM_DETAIL_SECTION_IDS.progress, label: t('progress') },
    { id: MEMBER_CLAIM_DETAIL_SECTION_IDS.messaging, label: t('messages') },
    { id: MEMBER_CLAIM_DETAIL_SECTION_IDS.evidence, label: t('evidence') },
    { id: MEMBER_CLAIM_DETAIL_SECTION_IDS.history, label: t('history') },
  ];

  return (
    <div className={`${DETAIL_HEADER_CARD} space-y-5`}>
      <header className="min-w-0 space-y-5">
        <Link href="/member" className={DETAIL_QUIET_LINK}>
          <ArrowLeft
            aria-hidden="true"
            className="size-4 shrink-0"
            data-testid="member-claim-back-icon"
          />
          {t('backToWorkspace')}
        </Link>

        <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="space-y-1">
              <p className={DETAIL_TERM}>{t('caseLabel')}</p>
              <h1 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            </div>
            <dl className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <dt className="text-foreground/70">{t('referenceLabel')}</dt>
                <dd className="min-w-0 break-all font-medium">{claimId}</dd>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2">
                <dt className="sr-only">{t('statusLabel')}</dt>
                <dd className={caseSummaryStatusPillClass(status)} data-testid="ops-status-badge">
                  {localizedStatusLabel}
                </dd>
              </div>
            </dl>
          </div>

          <div className="flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end">
            {uploadAction && uploadAction.visible !== false ? (
              <ClaimEvidenceUploadDialog
                claimId={claimId}
                trigger={
                  <Button
                    className={
                      uploadAction.variant === 'outline' ? DETAIL_OUTLINE_BUTTON : DETAIL_BUTTON
                    }
                    data-testid={uploadAction.testId}
                    disabled={uploadAction.disabled}
                    title={uploadAction.disabledReason}
                    variant={uploadAction.variant ?? 'default'}
                  >
                    <Upload
                      aria-hidden="true"
                      className="size-4 shrink-0"
                      data-testid="member-claim-upload-icon"
                    />
                    {uploadAction.label}
                  </Button>
                }
              />
            ) : null}
            {secondaryActions
              .filter(action => action.visible !== false)
              .map(action => (
                <Button
                  key={action.id}
                  className={
                    (action.variant ?? 'outline') === 'outline'
                      ? DETAIL_OUTLINE_BUTTON
                      : DETAIL_BUTTON
                  }
                  data-testid={action.testId}
                  disabled={action.disabled}
                  onClick={action.onClick}
                  title={action.disabledReason}
                  variant={action.variant ?? 'outline'}
                >
                  {action.icon}
                  {action.label}
                </Button>
              ))}
          </div>
        </div>
      </header>

      <nav aria-label={t('sectionNavigation')} className={DETAIL_DIVIDER}>
        <ul className="flex flex-wrap gap-2">
          {sectionLinks.map(section => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="inline-flex min-h-11 items-center rounded-xl border border-[hsl(var(--border-strong))] px-4 text-sm font-semibold hover:bg-[hsl(var(--surface-strong))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 forced-colors:border-[CanvasText] forced-colors:focus-visible:outline"
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
