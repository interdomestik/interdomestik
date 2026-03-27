import { Link } from '@/i18n/routing';
import { formatPilotDateTime } from '@/lib/utils/date';
import { getTranslations } from 'next-intl/server';
import type { ReactElement } from 'react';

export type ActiveClaimFocusProps = {
  claimNumber: string | null;
  status: string;
  stageLabel: string;
  stageKey?: string | null;
  updatedAt: string | null;
  nextMemberAction?: {
    label: string;
    href: string;
  };
  locale: string;
};

export async function ActiveClaimFocus({
  claimNumber,
  status,
  stageLabel,
  stageKey,
  updatedAt,
  nextMemberAction,
  locale,
}: ActiveClaimFocusProps): Promise<ReactElement> {
  const [tDashboard, tClaimStatus, tClaimStage] = await Promise.all([
    getTranslations('dashboard.member_landing'),
    getTranslations('claims.status'),
    getTranslations('claims.stage'),
  ]);
  const localizedStatus = (() => {
    try {
      return tClaimStatus(status as never);
    } catch {
      return status;
    }
  })();
  const localizedUpdatedAt = updatedAt ? formatPilotDateTime(updatedAt, locale, '—') : '—';
  const localizedStage = (() => {
    if (!stageKey) {
      return stageLabel;
    }

    try {
      return tClaimStage(stageKey as never);
    } catch {
      return stageLabel;
    }
  })();
  const showSeparateStatusLine =
    localizedStatus.trim().toLocaleLowerCase(locale) !==
    localizedStage.trim().toLocaleLowerCase(locale);

  return (
    <section data-testid="member-active-claim">
      <h2>{tDashboard('active_claim_title')}</h2>
      <p>{claimNumber ?? '—'}</p>
      <p>{localizedStage}</p>
      {showSeparateStatusLine ? <p>{localizedStatus}</p> : null}
      <p>
        {tDashboard('updated_label')}: {localizedUpdatedAt}
      </p>
      {nextMemberAction ? <Link href={nextMemberAction.href}>{nextMemberAction.label}</Link> : null}
    </section>
  );
}
