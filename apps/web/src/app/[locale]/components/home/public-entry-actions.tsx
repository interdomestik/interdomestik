import { Link } from '@/i18n/routing';
import {
  PUBLIC_FREE_START_ANCHOR_HREF,
  PUBLIC_MEMBERSHIP_ENTRY_HREF,
} from '@/lib/public-membership-entry';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

const secondaryActions = [
  {
    description: 'helpNowDescription',
    href: '/help-now',
    testId: 'public-entry-help-now',
    title: 'helpNowTitle',
  },
  {
    description: 'caseDescription',
    href: PUBLIC_FREE_START_ANCHOR_HREF,
    testId: 'public-entry-case-organize',
    title: 'caseTitle',
  },
] as const;

export function PublicMembershipAction() {
  const t = useTranslations('hero.publicEntry');

  return (
    <Link
      data-testid="public-entry-membership"
      href={PUBLIC_MEMBERSHIP_ENTRY_HREF}
      className="mt-9 inline-flex min-h-14 w-full max-w-[44rem] items-center justify-between gap-4 rounded-md bg-[hsl(var(--primary))] px-5 py-3 text-left text-base font-semibold text-[hsl(var(--primary-foreground))] shadow-sm transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 motion-reduce:transition-none sm:px-7 sm:text-lg"
    >
      <span>{t('membershipLabel')}</span>
      <ArrowRight aria-hidden="true" className="h-5 w-5 shrink-0" />
    </Link>
  );
}

export function PublicEntrySecondaryActions() {
  const t = useTranslations('hero.publicEntry');

  return (
    <div className="pt-5">
      <p className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
        {t('utilityPrompt')}
      </p>
      <ul className="mt-4 grid gap-2 md:grid-cols-2 md:gap-4">
        {secondaryActions.map((action, index) => (
          <li
            key={action.testId}
            className={index === 0 ? 'border-b border-slate-200 md:border-b-0' : ''}
          >
            <Link
              data-testid={action.testId}
              href={action.href}
              className={`group flex min-h-32 w-full items-start justify-between gap-5 py-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))] ${index === 0 ? 'px-1 md:pr-6' : 'px-1 md:pl-6'}`}
            >
              <span>
                <span className="block text-lg font-bold text-[hsl(var(--primary))] sm:text-xl">
                  {t(action.title)}
                </span>
                <span className="mt-2 block max-w-md text-base leading-6 text-slate-700">
                  {t(action.description)}
                </span>
              </span>
              <ArrowRight
                aria-hidden="true"
                className="mt-1 h-5 w-5 shrink-0 text-[hsl(var(--primary))] transition-transform group-hover:translate-x-1 motion-reduce:transform-none motion-reduce:transition-none motion-reduce:duration-0"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PublicEntryActions() {
  return (
    <>
      <PublicMembershipAction />
      <PublicEntrySecondaryActions />
    </>
  );
}
