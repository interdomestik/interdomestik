'use client';

import { MessagingPanel } from '@/components/messaging/messaging-panel';
import { OpsActionBar, OpsDocumentsPanel, OpsStatusBadge, OpsTimeline } from '@/components/ops';
import {
  getClaimActions,
  OpsActionConfig,
  toOpsDocuments,
  toOpsStatus,
  toOpsTimelineEvents,
} from '@/components/ops/adapters/claims';
import type {
  ClaimMatterAllowanceDto,
  ClaimProgressSummaryDto,
  ClaimRecoveryDecisionDto,
  ClaimTrackingDetailDto,
  ClaimTrackingDocument,
  ClaimTimelineEvent,
} from '@/features/claims/tracking/types';
import { Link } from '@/i18n/routing';
import { formatPilotDateTime } from '@/lib/utils/date';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { LifeBuoy, Upload } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRef } from 'react';
import { ClaimEvidenceUploadDialog } from './ClaimEvidenceUploadDialog';

type SerializedClaimTrackingDocument = Omit<ClaimTrackingDocument, 'createdAt'> & {
  createdAt: ClaimTrackingDocument['createdAt'] | string;
};

type SerializedClaimTimelineEvent = Omit<ClaimTimelineEvent, 'date'> & {
  date: ClaimTimelineEvent['date'] | string;
};

type SerializedClaimMatterAllowance = Omit<ClaimMatterAllowanceDto, 'windowStart' | 'windowEnd'> & {
  windowStart: ClaimMatterAllowanceDto['windowStart'] | string;
  windowEnd: ClaimMatterAllowanceDto['windowEnd'] | string;
};

type SerializedClaimRecoveryDecision = ClaimRecoveryDecisionDto;

type SerializedClaimProgressSummary = Omit<ClaimProgressSummaryDto, 'latestUpdateAt'> & {
  latestUpdateAt: ClaimProgressSummaryDto['latestUpdateAt'] | string;
};

type MemberClaimDetailOpsClaim = Omit<
  ClaimTrackingDetailDto,
  | 'createdAt'
  | 'updatedAt'
  | 'documents'
  | 'timeline'
  | 'matterAllowance'
  | 'recoveryDecision'
  | 'progressSummary'
> & {
  createdAt: ClaimTrackingDetailDto['createdAt'] | string;
  updatedAt: ClaimTrackingDetailDto['updatedAt'] | string | null;
  documents: SerializedClaimTrackingDocument[];
  timeline: SerializedClaimTimelineEvent[];
  progressSummary: SerializedClaimProgressSummary;
  matterAllowance?: SerializedClaimMatterAllowance | null;
  recoveryDecision?: SerializedClaimRecoveryDecision | null;
};

interface MemberClaimDetailOpsPageProps {
  claim: MemberClaimDetailOpsClaim;
  currentUser: {
    id: string;
    name: string;
    image: string | null;
    role: string;
  };
}

export function MemberClaimDetailOpsPage({
  claim,
  currentUser,
}: Readonly<MemberClaimDetailOpsPageProps>) {
  const messagingSectionRef = useRef<HTMLElement | null>(null);
  const locale = useLocale();
  const t = useTranslations('claims');
  const tTrackingStatus = useTranslations('claims-tracking.status');
  const tTrackingNextStep = useTranslations('claims-tracking.status.next_step');
  const tTrackingSla = useTranslations('claims-tracking.tracking.sla');
  const tAssurance = useTranslations('claims-tracking.tracking.assurance');
  const tClaimStatus = useTranslations('claims.status');

  const translateTrackingStatus = (labelKey: string) => {
    if (!labelKey.startsWith('claims-tracking.status.')) {
      return labelKey;
    }

    return tTrackingStatus(labelKey.replace('claims-tracking.status.', ''));
  };

  const translateAssurance = (labelKey: string) => {
    if (!labelKey.startsWith('claims-tracking.tracking.assurance.')) {
      return labelKey;
    }

    return tAssurance(labelKey.replace('claims-tracking.tracking.assurance.', ''));
  };

  // Transform events and translate titles
  const opsEvents = toOpsTimelineEvents(claim.timeline).map(e => ({
    ...e,
    // claim.timeline labelKey is a fully qualified key (e.g. "claims-tracking.status.evaluation").
    // Translating it within the "claims" namespace causes missing-message errors in production.
    title: translateTrackingStatus(e.title),
  }));

  const opsDocuments = toOpsDocuments(claim.documents);
  const localizedStatusLabel = (() => {
    try {
      return tClaimStatus(claim.status as never);
    } catch {
      return claim.status.replace(/_/g, ' ').toUpperCase();
    }
  })();

  // Policy-driven actions
  const { secondary } = getClaimActions(claim, t);

  const handleAction = (id: string) => {
    if (id === 'message') {
      messagingSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      messagingSectionRef.current?.focus();
      return;
    }

    // 10C: Safe wiring
    console.log('[Claim Action]', id, claim.id);
  };

  const mapAction = (config: OpsActionConfig) => ({
    ...config,
    onClick: () => handleAction(config.id),
  });

  const uploadAction = secondary.find(action => action.id === 'upload');
  const secondaryActions = secondary.filter(action => action.id !== 'upload').map(mapAction);
  const latestUpdateDate = formatPilotDateTime(
    claim.progressSummary.latestUpdateAt,
    locale,
    String(claim.progressSummary.latestUpdateAt)
  );
  const nextStepLabel = claim.progressSummary.nextStepKey.startsWith(
    'claims-tracking.status.next_step.'
  )
    ? tTrackingNextStep(
        claim.progressSummary.nextStepKey.replace('claims-tracking.status.next_step.', '')
      )
    : claim.progressSummary.nextStepKey;
  const hasMemberSlaStatus = claim.slaPhase === 'incomplete' || claim.slaPhase === 'running';

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">{claim.title}</h1>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-muted-foreground text-sm">{claim.id}</span>
            <OpsStatusBadge {...toOpsStatus(claim.status)} label={localizedStatusLabel} />
          </div>
        </div>
        <OpsActionBar>
          <div className="flex gap-2 w-full justify-end">
            {uploadAction ? (
              <ClaimEvidenceUploadDialog
                claimId={claim.id}
                trigger={
                  <Button size="sm">
                    <Upload className="w-4 h-4 mr-2" /> {uploadAction.label}
                  </Button>
                }
              />
            ) : null}
            {secondaryActions.map(action => (
              <Button
                key={action.id ?? action.label}
                variant={action.variant ?? 'outline'}
                onClick={action.onClick}
                disabled={action.disabled}
                title={action.disabledReason}
                data-testid={action.testId}
                size="sm"
              >
                {action.icon}
                {action.label}
              </Button>
            ))}
          </div>
        </OpsActionBar>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Card data-testid="member-claim-progress-summary">
            <CardHeader>
              <CardTitle>{t('detail.progress.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <span className="text-xs uppercase text-muted-foreground">
                    {t('detail.progress.currentState')}
                  </span>
                  <p className="mt-1 font-semibold" data-testid="member-claim-current-state">
                    {translateTrackingStatus(claim.progressSummary.currentStatusLabelKey)}
                  </p>
                </div>
                <div>
                  <span className="text-xs uppercase text-muted-foreground">
                    {t('detail.progress.latestUpdate')}
                  </span>
                  <p className="mt-1 font-semibold" data-testid="member-claim-latest-update">
                    {translateTrackingStatus(claim.progressSummary.latestUpdateLabelKey)}
                  </p>
                  <p
                    className="mt-1 text-xs text-muted-foreground"
                    data-testid="member-claim-latest-update-date"
                  >
                    {latestUpdateDate}
                  </p>
                  {claim.progressSummary.latestUpdateNote ? (
                    <p className="mt-2 text-sm" data-testid="member-claim-latest-update-note">
                      {claim.progressSummary.latestUpdateNote}
                    </p>
                  ) : null}
                </div>
                <div>
                  <span className="text-xs uppercase text-muted-foreground">
                    {t('detail.progress.nextAction')}
                  </span>
                  <p
                    className="mt-1 text-sm leading-6"
                    data-testid="member-claim-expected-next-action"
                  >
                    {nextStepLabel}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {hasMemberSlaStatus ? (
            <Card data-testid="member-claim-sla-status">
              <CardHeader>
                <CardTitle>{tTrackingSla('title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium" data-testid="member-claim-sla-status-phase">
                  {tTrackingSla(claim.slaPhase)}
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card data-testid="member-claim-trust-sla-panel">
            <CardHeader>
              <CardTitle>{translateAssurance(claim.memberTrustSummary.titleKey)}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <span className="text-xs uppercase text-muted-foreground">
                    {tAssurance('stateLabel')}
                  </span>
                  <p className="mt-1 font-semibold" data-testid="member-claim-trust-sla-state">
                    {translateAssurance(claim.memberTrustSummary.stateLabelKey)}
                  </p>
                </div>
                <div>
                  <span className="text-xs uppercase text-muted-foreground">
                    {tAssurance('latestUpdateLabel')}
                  </span>
                  <p className="mt-1 font-semibold" data-testid="member-claim-trust-sla-latest">
                    {latestUpdateDate}
                  </p>
                </div>
                <div>
                  <span className="text-xs uppercase text-muted-foreground">
                    {tAssurance('supportLabel')}
                  </span>
                  <Button className="mt-2 w-full justify-start" size="sm" variant="outline" asChild>
                    <Link href={claim.memberTrustSummary.supportHref}>
                      <LifeBuoy className="mr-2 h-4 w-4" />
                      {tAssurance('supportCta')}
                    </Link>
                  </Button>
                </div>
              </div>
              <p
                className="mt-4 text-sm text-muted-foreground"
                data-testid="member-claim-trust-sla-body"
              >
                {translateAssurance(claim.memberTrustSummary.bodyKey)}
              </p>
            </CardContent>
          </Card>

          {claim.recoveryDecision ? (
            <Card data-testid="member-claim-recovery-decision">
              <CardHeader>
                <CardTitle>{claim.recoveryDecision.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {claim.recoveryDecision.description}
                </p>
              </CardContent>
            </Card>
          ) : null}

          {claim.matterAllowance ? (
            <Card data-testid="member-claim-matter-allowance">
              <CardHeader>
                <CardTitle>{t('detail.matterAllowance.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-xs uppercase text-muted-foreground">
                      {t('detail.matterAllowance.used')}
                    </span>
                    <p
                      className="mt-1 text-lg font-semibold"
                      data-testid="member-claim-matter-allowance-used"
                    >
                      {claim.matterAllowance.consumedCount}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs uppercase text-muted-foreground">
                      {t('detail.matterAllowance.remaining')}
                    </span>
                    <p
                      className="mt-1 text-lg font-semibold"
                      data-testid="member-claim-matter-allowance-remaining"
                    >
                      {claim.matterAllowance.remainingCount}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs uppercase text-muted-foreground">
                      {t('detail.matterAllowance.total')}
                    </span>
                    <p
                      className="mt-1 text-lg font-semibold"
                      data-testid="member-claim-matter-allowance-total"
                    >
                      {claim.matterAllowance.allowanceTotal}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>{t('detail.caseDetails')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{claim.description}</p>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <span className="text-xs text-muted-foreground uppercase">
                    {t('table.amount')}
                  </span>
                  <p className="font-medium">
                    {claim.amount} {claim.currency}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <OpsDocumentsPanel
            title={t('detail.evidence')}
            documents={opsDocuments}
            emptyLabel={t('detail.documentsEmpty')}
            viewLabel={t('detail.viewDocument')}
            headerActions={
              <ClaimEvidenceUploadDialog
                claimId={claim.id}
                trigger={
                  <Button size="sm" variant="outline">
                    <Upload className="w-4 h-4 mr-2" /> {t('claimsPro.actions.uploadEvidence')}
                  </Button>
                }
              />
            }
          />

          <section
            ref={messagingSectionRef}
            data-testid="member-claim-detail-messaging"
            tabIndex={-1}
          >
            <MessagingPanel claimId={claim.id} currentUser={currentUser} allowInternal={false} />
          </section>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <OpsTimeline
            title={t('timeline.title')}
            events={opsEvents}
            emptyLabel={t('timeline.empty')}
            formatTimestamp={value => formatPilotDateTime(value, locale, String(value))}
          />
        </div>
      </div>
    </div>
  );
}
