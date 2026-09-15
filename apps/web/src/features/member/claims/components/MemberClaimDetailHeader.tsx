'use client';

import { OpsStatusBadge } from '@/components/ops';
import { toOpsStatus, type OpsActionConfig } from '@/components/ops/adapters/claims';
import { Link } from '@/i18n/routing';
import { Button, Card, CardContent } from '@interdomestik/ui';
import { ArrowLeft, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ClaimEvidenceUploadDialog } from './ClaimEvidenceUploadDialog';
import type { MemberClaimDetailOpsClaim } from './member-claim-detail-types';

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
  const statusPresentation = toOpsStatus(status);
  const sectionLinks = [
    { id: MEMBER_CLAIM_DETAIL_SECTION_IDS.progress, label: t('progress') },
    { id: MEMBER_CLAIM_DETAIL_SECTION_IDS.evidence, label: t('evidence') },
    { id: MEMBER_CLAIM_DETAIL_SECTION_IDS.history, label: t('history') },
    { id: MEMBER_CLAIM_DETAIL_SECTION_IDS.messaging, label: t('messages') },
  ];

  return (
    <Card className="min-w-0 border-border/70 bg-card shadow-sm">
      <CardContent className="min-w-0 p-5 sm:p-6">
        <header className="min-w-0">
          <Link
            href="/member"
            className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ArrowLeft
              aria-hidden="true"
              className="size-4 shrink-0"
              data-testid="member-claim-back-icon"
            />
            {t('backToWorkspace')}
          </Link>

          <div className="mt-5 flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t('caseLabel')}
              </p>
              <h1 className="mt-1 break-words text-2xl font-bold tracking-tight sm:text-3xl">
                {title}
              </h1>
              <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-0 break-all text-sm text-muted-foreground">{claimId}</span>
                <OpsStatusBadge {...statusPresentation} label={localizedStatusLabel} />
              </div>
            </div>

            <div className="flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end">
              {uploadAction && uploadAction.visible !== false ? (
                <ClaimEvidenceUploadDialog
                  claimId={claimId}
                  trigger={
                    <Button
                      className="h-auto min-h-11 whitespace-normal"
                      data-testid={uploadAction.testId}
                      disabled={uploadAction.disabled}
                      size="sm"
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
                    className="h-auto min-h-11 whitespace-normal"
                    data-testid={action.testId}
                    disabled={action.disabled}
                    onClick={action.onClick}
                    size="sm"
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

        <nav aria-label={t('sectionNavigation')} className="mt-6 border-t border-border/70 pt-4">
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {sectionLinks.map(section => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </CardContent>
    </Card>
  );
}
