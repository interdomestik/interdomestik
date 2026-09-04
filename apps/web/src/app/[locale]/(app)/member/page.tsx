import { evaluateNeutralOtpHost } from '@/app/api/auth/[...all]/neutral-otp-boundary';
// prettier-ignore
import { MemberPortalRuntime, type MemberPortalCopy } from '@/components/dashboard/member-portal-runtime';
import { requireSessionOrRedirect } from '@/components/shell/session';
import type { AppLocale } from '@/i18n/locales';
import { getCachedSession } from '@/lib/auth.server';
import { resolveDefaultPublicTenantId } from '@/lib/tenant/tenant-hosts';
import { getMemberCaseSummaries, getMemberPortalMembership } from '@interdomestik/domain-member';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getMemberDashboardCore } from './_core';
import { resolveMemberActorRoleOnSession } from './actor-role-on-session';

// prettier-ignore
type PortalMessages = Omit<MemberPortalCopy, 'actions' | 'caseLabels' | 'navigation' | 'referenceFallback' | 'status'> & { actions: Record<keyof MemberPortalCopy['actions'], string>; navigation: Omit<MemberPortalCopy['navigation'], 'helpNow'> & { help_now: string }; next_steps: Record<'court_schedule' | 'external_response' | 'member_action' | 'team_review', string>; warnings: Record<'active_in_grace' | 'grace_expired' | 'scheduled_cancel', string> };

// prettier-ignore
export default async function DashboardPage({ params }: Readonly<{ params: Promise<{ locale: AppLocale }> }>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = requireSessionOrRedirect(await getCachedSession(), locale);
  const { id: memberId, role, tenantId } = session.user;
  if (!memberId || !role || !tenantId) notFound();
  const actor = resolveMemberActorRoleOnSession(role);
  if (!actor) notFound();
  // prettier-ignore
  const access = getMemberDashboardCore({ locale, role: actor, userId: memberId });
  if (access.kind === 'redirect') redirect(access.to);
  if (access.kind === 'forbidden' || actor !== 'member') notFound();

  // prettier-ignore
  const draft = evaluateNeutralOtpHost(await headers()) && (role === 'member' || role === 'user') && tenantId === resolveDefaultPublicTenantId();

  // prettier-ignore
  const [t, dashboard] = await Promise.all([getTranslations({ locale, namespace: 'claims' }), getTranslations({ locale, namespace: 'dashboard' })]);
  const q = { memberId, tenantId };
  const cases = getMemberCaseSummaries(q);
  const membership = getMemberPortalMembership(q);
  const portal = dashboard.raw('portal') as PortalMessages;
  const { help_now: helpNow, ...nav } = portal.navigation;
  const status: MemberPortalCopy['status'] = value => t(`status.${value}`);
  // prettier-ignore
  const nextStep = (summary: Parameters<MemberPortalCopy['caseLabels']>[0]) => summary.nextStep === 'complete' ? status(summary.status) : portal.next_steps[summary.nextStep];
  // prettier-ignore
  const action = (bucket: keyof MemberPortalCopy['actions'], warning?: keyof PortalMessages['warnings']): MemberPortalCopy['actions'][keyof MemberPortalCopy['actions']] => ({ description: portal.description, label: portal.actions[bucket], warning: warning ? portal.warnings[warning] : null });
  const copy: MemberPortalCopy = {
    ...portal,
    // prettier-ignore
    actions: { active: action('active'), active_in_grace: action('active_in_grace', 'active_in_grace'), canceled: action('canceled'), grace_expired: action('grace_expired', 'grace_expired'), none: action('none'), scheduled_cancel: action('scheduled_cancel', 'scheduled_cancel'), trialing: action('trialing') },
    // prettier-ignore
    caseLabels: summary => ({ documentCount: t('detail.evidence'), nextStep: t('detail.progress.nextAction'), nextStepValue: nextStep(summary), reference: t('success.case_id'), referenceFallback: t('claim'), status: t('table.status'), statusValue: status(summary.status) }),
    navigation: { ...nav, helpNow },
    referenceFallback: t('claim'),
    status,
  };

  // prettier-ignore
  return <div data-testid="member-dashboard-ready"><MemberPortalRuntime canDraft={draft} caseTask={cases} copy={copy} isAgent={role === 'agent'} locale={locale} membershipTask={membership} /></div>;
}
