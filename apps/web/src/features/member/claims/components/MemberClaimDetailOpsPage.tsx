'use client';

import { MessagingPanel } from '@/components/messaging/messaging-panel';
import { OpsTimeline } from '@/components/ops';
import {
  getClaimActions,
  OpsActionConfig,
  toOpsTimelineEvents,
} from '@/components/ops/adapters/claims';
import { useTrackingLabelTranslator } from '@/features/claims/tracking/components/useTrackingLabelTranslator';
import { Link } from '@/i18n/routing';
import { formatPilotDateTime } from '@/lib/utils/date';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { LifeBuoy } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, type ReactNode } from 'react';
import { CaseCompanionNextStepCard } from './CaseCompanionNextStepCard';
import { MemberClaimEvidenceSection } from './MemberClaimEvidenceSection';
import {
  MEMBER_CLAIM_DETAIL_SECTION_IDS,
  MemberClaimDetailHeader,
} from './MemberClaimDetailHeader';
import type { MemberClaimDetailOpsClaim } from './member-claim-detail-types';

interface MemberClaimDetailOpsPageProps {
  informationRequests?: ReactNode;
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
  informationRequests,
}: Readonly<MemberClaimDetailOpsPageProps>) {
  const messagingSectionRef = useRef<HTMLElement | null>(null);
  const locale = useLocale();
  const t = useTranslations('claims');
  const tTrackingSla = useTranslations('claims-tracking.tracking.sla');
  const tAssurance = useTranslations('claims-tracking.tracking.assurance');
  const tClaimStatus = useTranslations('claims.status');
  const tContinuity = useTranslations('claims.detail.continuity');
  const translateTrackingLabel = useTrackingLabelTranslator();

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
    title: translateTrackingLabel(e.title),
  }));

  const localizedStatusLabel = (() => {
    try {
      return tClaimStatus(claim.status as never);
    } catch {
      return claim.status.replace(/_/g, ' ').toUpperCase();
    }
  })();

  const { secondary } = getClaimActions(claim, t);

  const handleAction = (id: string) => {
    if (id === 'message') {
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      messagingSectionRef.current?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      });
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
  const hasMemberSlaStatus = claim.slaPhase === 'incomplete' || claim.slaPhase === 'running';

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-8">
      <MemberClaimDetailHeader
        claimId={claim.id}
        localizedStatusLabel={localizedStatusLabel}
        secondaryActions={secondaryActions}
        status={claim.status}
        title={claim.title}
        uploadAction={uploadAction}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <section
            id={MEMBER_CLAIM_DETAIL_SECTION_IDS.progress}
            aria-label={tContinuity('progress')}
            className="scroll-mt-24 space-y-6"
          >
            <Card data-testid="member-claim-progress-summary">
              <CardHeader>
                <CardTitle>{t('detail.progress.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <span className="text-xs uppercase text-muted-foreground">
                      {t('detail.progress.currentState')}
                    </span>
                    <p className="mt-1 font-semibold" data-testid="member-claim-current-state">
                      {translateTrackingLabel(claim.progressSummary.currentStatusLabelKey)}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs uppercase text-muted-foreground">
                      {t('detail.progress.latestUpdate')}
                    </span>
                    <p className="mt-1 font-semibold" data-testid="member-claim-latest-update">
                      {translateTrackingLabel(claim.progressSummary.latestUpdateLabelKey)}
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
                </div>
              </CardContent>
            </Card>

            <CaseCompanionNextStepCard nextStep={claim.caseCompanionNextStep} />
            {informationRequests}
          </section>

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
                    <Link
                      href={claim.memberTrustSummary.supportHref}
                      data-testid="member-claim-trust-sla-support-link"
                    >
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

          <section
            id={MEMBER_CLAIM_DETAIL_SECTION_IDS.evidence}
            aria-label={tContinuity('evidence')}
            className="scroll-mt-24"
          >
            <MemberClaimEvidenceSection
              claimId={claim.id}
              documents={claim.documents}
              vaultConsentDisplay={claim.vaultConsentDisplay}
            />
          </section>
        </div>

        {/* Sidebar */}
        <aside
          id={MEMBER_CLAIM_DETAIL_SECTION_IDS.history}
          aria-label={tContinuity('history')}
          className="scroll-mt-24 lg:col-span-1"
        >
          <OpsTimeline
            title={t('timeline.title')}
            events={opsEvents}
            emptyLabel={t('timeline.empty')}
            formatTimestamp={value => formatPilotDateTime(value, locale, String(value))}
          />
        </aside>

        <section
          ref={messagingSectionRef}
          id={MEMBER_CLAIM_DETAIL_SECTION_IDS.messaging}
          aria-label={tContinuity('messages')}
          className="scroll-mt-24 lg:col-span-2"
          data-testid="member-claim-detail-messaging"
          tabIndex={-1}
        >
          <MessagingPanel claimId={claim.id} currentUser={currentUser} allowInternal={false} />
        </section>
      </div>
    </div>
  );
}
