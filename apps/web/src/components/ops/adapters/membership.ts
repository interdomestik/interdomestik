import { OpsAction, OpsDocument, OpsTimelineEvent } from '../types';
import { toOpsBadgeVariant } from './status';
type TranslateFn = (key: string) => string;

export type DbDocument = {
  id: string;
  fileName: string;
  storagePath: string;
  uploadedAt: Date;
};

type SubscriptionLike = {
  id: string;
  status: string | null;
  planId?: string | null;
  provider?: string | null;
  acquisitionSource?: string | null;
  createdAt: Date | null;
  currentPeriodEnd: Date | null;
  canceledAt?: Date | null;
  cancelAtPeriodEnd?: boolean | null;
};

export type OpsActionConfig = Omit<OpsAction, 'onClick'> & { id: string };
export type SponsoredMembershipState =
  'activation_required' | 'eligible_for_family_upgrade' | 'none';

export function isSponsoredSubscription(sub: SubscriptionLike | undefined) {
  if (!sub) return false;
  return sub.provider === 'group_sponsor' || sub.acquisitionSource === 'group_roster_import';
}

export function getSponsoredMembershipState(
  sub: SubscriptionLike | undefined
): SponsoredMembershipState {
  if (!isSponsoredSubscription(sub)) {
    return 'none';
  }

  if (sub?.status === 'paused') {
    return 'activation_required';
  }

  if (sub?.status === 'active' && sub.planId === 'standard') {
    return 'eligible_for_family_upgrade';
  }

  return 'none';
}

export function toOpsStatus(status: string | null | undefined) {
  const safeStatus = status || 'none';
  return {
    label: safeStatus.replace(/_/g, ' ').toUpperCase(),
    variant: toOpsBadgeVariant(safeStatus),
  };
}

export function toOpsDocuments(docs: DbDocument[] | undefined): OpsDocument[] {
  if (!docs || !Array.isArray(docs)) return [];
  return docs.map(d => ({
    id: d.id,
    name: d.fileName,
    url: '#', // TODO: Implement secure download link generation
    uploadedAt: d.uploadedAt,
  }));
}

export function toOpsTimelineEvents(
  sub: SubscriptionLike | undefined,
  t: TranslateFn
): OpsTimelineEvent[] {
  if (!sub) return [];

  const events: OpsTimelineEvent[] = [];

  // Creation event
  if (sub.createdAt) {
    events.push({
      id: `${sub.id}-created`,
      title: t('timeline.created_title'),
      description: t('timeline.created_description'),
      date: new Date(sub.createdAt).toISOString(),
      tone: 'neutral',
    });
  }

  // Current billing period end. This is a factual period boundary, never a
  // confirmed renewal, so the title only distinguishes past from upcoming.
  if (sub.currentPeriodEnd) {
    const isPast = new Date(sub.currentPeriodEnd) < new Date();
    const title = isPast ? t('timeline.period_ended_title') : t('timeline.period_end_title');
    events.push({
      id: `${sub.id}-cycle`,
      title,
      description: t('timeline.period_end_description'),
      date: new Date(sub.currentPeriodEnd).toISOString(),
      tone: isPast ? 'warning' : 'neutral',
    });
  }

  // Cancellation
  if (sub.canceledAt) {
    events.push({
      id: `${sub.id}-canceled`,
      title: t('timeline.canceled_title'),
      description: t('timeline.canceled_description'),
      date: new Date(sub.canceledAt).toISOString(),
      tone: 'danger',
    });
  }

  // Sort detailed timeline (newest first)
  return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getMembershipActions(
  sub: SubscriptionLike | undefined,
  t: (key: string) => string
): { primary?: OpsActionConfig; secondary: OpsActionConfig[] } {
  if (!sub) {
    return {
      primary: {
        id: 'complete_membership',
        label: t('ops.complete_membership'),
        variant: 'default',
      },
      secondary: [],
    };
  }

  const secondary: OpsActionConfig[] = [];
  let primary: OpsActionConfig | undefined;

  const now = new Date();
  const currentPeriodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const isPastDue = sub.status === 'past_due';
  const isActive = sub.status === 'active';
  const isTrialing = sub.status === 'trialing';
  const daysToRenewal = currentPeriodEnd
    ? Math.ceil((currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  // 10B SAFE actions
  // If status === 'past_due' => show primary "Update payment method"
  if (isPastDue) {
    primary = {
      id: 'update_payment',
      label: 'Update Payment Method',
      variant: 'default',
    };
  } else if (isActive && daysToRenewal <= 30 && daysToRenewal >= 0) {
    // If within 30 days of currentPeriodEnd AND active => show "Renew"
    primary = {
      id: 'renew',
      label: 'Renew',
      variant: 'default',
    };
  } else if (!isActive && !isTrialing) {
    primary = {
      id: 'complete_membership',
      label: t('ops.complete_membership'),
      variant: 'default',
    };
  }

  // Cancellation: show "Request cancellation"
  // Should allow cancellation if not already canceled
  if ((isActive || isPastDue) && !sub.canceledAt && !sub.cancelAtPeriodEnd) {
    secondary.push({
      id: 'cancel',
      label: 'Request Cancellation',
      variant: 'destructive',
    });
  }

  return { primary, secondary };
}
