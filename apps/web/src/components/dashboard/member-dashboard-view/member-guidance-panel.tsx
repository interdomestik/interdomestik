import { Button } from '@interdomestik/ui';
import { ArrowRight, FileText, Headphones, ShieldCheck } from 'lucide-react';

import { Link } from '@/i18n/routing';

import type { DashboardClaim, DashboardTranslator } from './types';

export function MemberGuidancePanel({
  activeClaim,
  hasNoClaims,
  isActive,
  supportHref,
  tLanding,
  validThru,
}: Readonly<{
  activeClaim: DashboardClaim | null;
  hasNoClaims: boolean;
  isActive: boolean;
  supportHref: string;
  tLanding: DashboardTranslator;
  validThru: string;
}>) {
  const claimNumber = activeClaim?.claimNumber ?? activeClaim?.id ?? tLanding('unavailable_short');
  const claimHref = activeClaim ? `/member/claims/${activeClaim.id}` : '/member/claims';
  const memberAction = activeClaim?.requiresMemberAction ? activeClaim.nextMemberAction : undefined;

  const nextAction = (() => {
    if (hasNoClaims && !isActive) {
      return {
        title: tLanding('activation_title'),
        body: tLanding('activation_body'),
        href: '/member/membership',
        cta: tLanding('guidance_membership_cta'),
        testId: 'member-guidance-activation',
      };
    }

    if (hasNoClaims) {
      return {
        title: tLanding('guidance_no_claim_title'),
        body: tLanding('guidance_no_claim_body'),
        href: '/member/claims/new',
        cta: tLanding('guidance_start_claim_cta'),
        testId: 'member-guidance-start-claim',
      };
    }

    if (memberAction) {
      return {
        title: tLanding('guidance_action_needed_title'),
        body: tLanding('guidance_action_needed_body', { claimNumber }),
        href: memberAction.href,
        cta: memberAction.label,
        testId: 'member-guidance-action-needed',
      };
    }

    if (activeClaim) {
      return {
        title: tLanding('guidance_active_claim_title'),
        body: tLanding('guidance_active_claim_body', { claimNumber }),
        href: claimHref,
        cta: tLanding('guidance_claim_review_cta'),
        testId: 'member-guidance-active-claim',
      };
    }

    return {
      title: tLanding('guidance_claims_title'),
      body: tLanding('guidance_claims_body'),
      href: '/member/claims',
      cta: tLanding('guidance_claims_cta'),
      testId: 'member-guidance-claims-history',
    };
  })();

  return (
    <section
      aria-labelledby="member-guidance-title"
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-950/70"
      data-testid="member-guidance-panel"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">
            {tLanding('guidance_label')}
          </p>
          <h2 id="member-guidance-title" className="text-xl font-bold tracking-tight">
            {tLanding('guidance_title')}
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {isActive
              ? tLanding('guidance_subtitle_active')
              : tLanding('guidance_subtitle_inactive')}
          </p>
        </div>
        <div
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold dark:border-white/10"
          data-testid="member-guidance-membership-status"
        >
          <ShieldCheck
            className={isActive ? 'h-4 w-4 text-emerald-600' : 'h-4 w-4 text-amber-600'}
          />
          <span>
            {isActive
              ? tLanding('guidance_membership_active')
              : tLanding('guidance_membership_inactive')}
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <article
          className="rounded-lg border border-slate-200 p-4 dark:border-white/10"
          data-testid={nextAction.testId}
        >
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300">
            <ArrowRight className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-bold">{nextAction.title}</h3>
          <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">{nextAction.body}</p>
          <Button
            asChild
            variant="outline"
            className="mt-4 h-auto rounded-lg px-3 py-2 text-sm font-bold"
          >
            <Link href={nextAction.href}>{nextAction.cta}</Link>
          </Button>
        </article>

        <article
          className="rounded-lg border border-slate-200 p-4 dark:border-white/10"
          data-testid="member-guidance-documents"
        >
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
            <FileText className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-bold">{tLanding('guidance_documents_title')}</h3>
          <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">
            {tLanding('guidance_documents_body')}
          </p>
          <Button
            asChild
            variant="outline"
            className="mt-4 h-auto rounded-lg px-3 py-2 text-sm font-bold"
          >
            <Link href="/member/documents">{tLanding('guidance_documents_cta')}</Link>
          </Button>
        </article>

        <article
          className="rounded-lg border border-slate-200 p-4 dark:border-white/10"
          data-testid="member-guidance-support"
        >
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
            <Headphones className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-bold">{tLanding('guidance_support_title')}</h3>
          <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">
            {isActive
              ? tLanding('guidance_membership_valid_thru', { validThru })
              : tLanding('guidance_support_inactive_body')}
          </p>
          <Button
            asChild
            variant="outline"
            className="mt-4 h-auto rounded-lg px-3 py-2 text-sm font-bold"
          >
            <Link href={isActive ? supportHref : '/member/membership'}>
              {isActive ? tLanding('guidance_support_cta') : tLanding('guidance_membership_cta')}
            </Link>
          </Button>
        </article>
      </div>
    </section>
  );
}
