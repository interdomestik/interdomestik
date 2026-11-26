'use client';

import { MemberCaseMessages } from './member-case-messages';
import { localizeMemberRecoveryPublicNote } from './member-recovery-public-note';
import { OUTLINED_LINK } from '@/components/dashboard/member-portal-link-styles';
import {
  getClaimActions,
  OpsActionConfig,
  toOpsTimelineEvents,
} from '@/components/ops/adapters/claims';
import { useTrackingLabelTranslator } from '@/features/claims/tracking/components/useTrackingLabelTranslator';
import { Link } from '@/i18n/routing';
import { formatPilotDateTime } from '@/lib/utils/date';
import { MemberClaimFactsCard } from './member-claim-facts-card';
import { MemberClaimMatterAllowanceCard } from './member-claim-matter-allowance-card';
import {
  DETAIL_CARD,
  DETAIL_DIVIDER,
  DETAIL_HEADING,
  DETAIL_TERM,
} from './member-claim-detail-styles';
import { MemberClaimTimeline } from './member-claim-timeline';
import { LifeBuoy } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, type ReactNode } from 'react';
import { CaseCompanionNextStepCard } from './CaseCompanionNextStepCard';
import { MemberClaimEvidenceSection } from './MemberClaimEvidenceSection';
import { MemberClaimProgressSummary } from './MemberClaimProgressSummary';
import { MemberRecoveryDecisionCard } from './MemberRecoveryDecisionCard';
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
  const opsEvents = toOpsTimelineEvents(claim.timeline).map(e => ({
    ...e,
    title: translateTrackingLabel(e.title),
    description: localizeMemberRecoveryPublicNote(e.description, t) ?? undefined,
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
    }
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
  // Status alone cannot establish an outstanding member duty, so the verification status must not
  // reuse the "waiting for your information" phase copy reserved for confirmed member tasks.
  const memberSlaCopyKey =
    claim.status === 'verification' && claim.slaPhase === 'incomplete'
      ? ('verification' as const)
      : claim.slaPhase;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8" data-testid="member-claim-detail-page">
      <MemberClaimDetailHeader
        claimId={claim.id}
        localizedStatusLabel={localizedStatusLabel}
        secondaryActions={secondaryActions}
        status={claim.status}
        title={claim.title}
        uploadAction={uploadAction}
      />

      {/* Task-first: public progress, the case companion step and any authoritative request. */}
      <section
        id={MEMBER_CLAIM_DETAIL_SECTION_IDS.progress}
        aria-label={tContinuity('progress')}
        className="min-w-0 scroll-mt-24 space-y-6"
      >
        <MemberClaimProgressSummary
          latestUpdateDate={latestUpdateDate}
          progressSummary={claim.progressSummary}
        />

        <CaseCompanionNextStepCard nextStep={claim.caseCompanionNextStep} />
        {informationRequests}
      </section>

      {/* Help and handling summary stay visible before secondary case content. */}
      <div className="grid min-w-0 gap-6" data-testid="member-claim-help-summary">
        {hasMemberSlaStatus ? (
          <div className={`${DETAIL_CARD} space-y-2`} data-testid="member-claim-sla-status">
            <h2 className={DETAIL_HEADING}>{tTrackingSla('title')}</h2>
            <p
              className="text-sm font-medium leading-6"
              data-testid="member-claim-sla-status-phase"
            >
              {tTrackingSla(memberSlaCopyKey)}
            </p>
          </div>
        ) : null}

        <div className={`${DETAIL_CARD} space-y-5`} data-testid="member-claim-trust-sla-panel">
          <h2 className={DETAIL_HEADING}>
            {translateAssurance(claim.memberTrustSummary.titleKey)}
          </h2>
          <dl className="grid min-w-0 gap-4 text-sm md:grid-cols-2">
            <div className="min-w-0 space-y-1">
              <dt className={DETAIL_TERM}>{tAssurance('stateLabel')}</dt>
              <dd className="font-semibold" data-testid="member-claim-trust-sla-state">
                {translateAssurance(claim.memberTrustSummary.stateLabelKey)}
              </dd>
            </div>
            <div className="min-w-0 space-y-1">
              <dt className={DETAIL_TERM}>{tAssurance('latestUpdateLabel')}</dt>
              <dd className="font-semibold" data-testid="member-claim-trust-sla-latest">
                {latestUpdateDate}
              </dd>
            </div>
          </dl>
          <p className="max-w-prose text-sm leading-6" data-testid="member-claim-trust-sla-body">
            {translateAssurance(claim.memberTrustSummary.bodyKey)}
          </p>
          <div className={`${DETAIL_DIVIDER} flex min-w-0 flex-wrap items-center gap-3`}>
            <p className={DETAIL_TERM}>{tAssurance('supportLabel')}</p>
            <Link
              className={OUTLINED_LINK}
              data-testid="member-claim-trust-sla-support-link"
              href={claim.memberTrustSummary.supportHref}
            >
              <LifeBuoy aria-hidden="true" className="size-4 shrink-0" />
              <span className="min-w-0">{tAssurance('supportCta')}</span>
            </Link>
          </div>
        </div>
      </div>

      <section
        ref={messagingSectionRef}
        id={MEMBER_CLAIM_DETAIL_SECTION_IDS.messaging}
        aria-label={tContinuity('messages')}
        className="min-w-0 scroll-mt-24"
        data-testid="member-claim-detail-messaging"
        tabIndex={-1}
      >
        <MemberCaseMessages claimId={claim.id} currentUser={currentUser} />
      </section>

      {/* Evidence, details and the public timeline: reference content after the member tasks. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {claim.recoveryDecision ? (
            <MemberRecoveryDecisionCard
              decision={claim.recoveryDecision}
              supportHref={claim.memberTrustSummary.supportHref}
            />
          ) : null}

          {claim.matterAllowance ? (
            <MemberClaimMatterAllowanceCard allowance={claim.matterAllowance} />
          ) : null}

          <MemberClaimFactsCard claim={claim} />

          <section
            id={MEMBER_CLAIM_DETAIL_SECTION_IDS.evidence}
            aria-label={tContinuity('evidence')}
            className="min-w-0 scroll-mt-24"
          >
            <MemberClaimEvidenceSection
              claimId={claim.id}
              documents={claim.documents}
              vaultConsentDisplay={claim.vaultConsentDisplay}
            />
          </section>
        </div>

        <aside
          id={MEMBER_CLAIM_DETAIL_SECTION_IDS.history}
          aria-label={tContinuity('history')}
          className="min-w-0 scroll-mt-24 lg:col-span-1"
        >
          <MemberClaimTimeline events={opsEvents} />
        </aside>
      </div>
    </div>
  );
}
