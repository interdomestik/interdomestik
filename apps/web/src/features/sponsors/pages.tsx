import { Link } from '@/i18n/routing';
import { SponsorTasksLink } from '@/features/sponsor-tasks/sponsor-tasks-link';
import {
  listSponsorsForActor,
  readSponsorRoster,
  type SponsorTermView,
} from '@interdomestik/domain-membership-billing/sponsors/roster-view';
import { sponsorCredentialCheck } from '@interdomestik/domain-membership-billing/sponsors/sponsor-jobs';
import { formatPilotDateTime } from '@/lib/utils/date';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ActionForm } from './action-form';
import { sponsorContext, mayUseArea, type SponsorArea } from './context.core';
import { companyLeads, sponsorUploadEnabled, termOptions } from './data.core';
import { Choice, Field, RevisionFields } from './fields';
import { SponsorRoster } from './roster';
import { TermControls } from './term-controls';

export type SponsorPageProps = {
  params: Promise<{ locale: string; sponsorId?: string; termId?: string }>;
};

async function TermSummary({
  term,
  locale,
}: {
  term: SponsorTermView;
  locale: string;
}): Promise<React.JSX.Element> {
  const t = await getTranslations({ locale, namespace: 'sponsors' });
  const at = (value: Date): string => formatPilotDateTime(value, locale, '');
  return (
    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <div>
        <dt>{t('fields.termStart')}</dt>
        <dd>{at(term.termStart)}</dd>
      </div>
      <div>
        <dt>{t('fields.termEnd')}</dt>
        <dd>{at(term.termEnd)}</dd>
      </div>
      <div>
        <dt>{t('fields.planKey')}</dt>
        <dd>{term.planKey}</dd>
      </div>
      <div>
        <dt>{t('fields.seatCount')}</dt>
        <dd>{term.seatCount ?? t('notApproved')}</dd>
      </div>
      <div>
        <dt>{t('effective')}</dt>
        <dd>{t(term.effective ? 'yes' : 'no')}</dd>
      </div>
      <div>
        <dt>{t('terminated')}</dt>
        <dd>{term.terminatedEffectiveAt ? at(term.terminatedEffectiveAt) : t('no')}</dd>
      </div>
    </dl>
  );
}

export async function SponsorPage({
  area,
  params,
}: SponsorPageProps & { area: SponsorArea }): Promise<React.JSX.Element> {
  const { locale, sponsorId, termId } = await params;
  setRequestLocale(locale);
  const context = await sponsorContext();
  if (!context || !mayUseArea(context.actor, area)) notFound();
  const t = await getTranslations({ locale, namespace: 'sponsors' });
  const sponsors = await listSponsorsForActor(context.authority, context.actor);
  const sponsor = sponsorId ? sponsors.find(row => row.sponsorId === sponsorId) : undefined;
  if (sponsorId && !sponsor) notFound();
  const base = `/${area}/sponsors`;
  let content: React.ReactNode;
  if (!sponsor) {
    const leads = await companyLeads(context);
    content = (
      <>
        {sponsors.length === 0 ? (
          <p>{t('emptySponsors')}</p>
        ) : (
          <ul className="space-y-2">
            {sponsors.map(row => (
              <li key={row.sponsorId}>
                <Link className="underline" href={`${base}/${row.sponsorId}`}>
                  {row.legalName}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {leads.length === 0 ? (
          <p>{t('noLeads')}</p>
        ) : (
          <ActionForm operation="createSponsor">
            <Choice name="leadId" options={leads} />
            <Field name="legalName" />
            <Field name="registrationNumber" required={false} />
            <Field name="taxNumber" required={false} />
            <Field name="billingContactName" />
            <Field name="billingContactEmail" type="email" />
          </ActionForm>
        )}
      </>
    );
  } else if (termId) {
    const term = sponsor.terms.find(row => row.termId === termId);
    if (!term) notFound();
    const result = await readSponsorRoster(
      context.authority,
      context.actor,
      { hasCredential: sponsorCredentialCheck(context.authority) },
      { termId, now: new Date() }
    );
    if (!result.ok || result.value.sponsorId !== sponsor.sponsorId) notFound();
    content = (
      <>
        <TermSummary term={term} locale={locale} />
        <SponsorRoster
          roster={result.value}
          uploadEnabled={await sponsorUploadEnabled(context)}
          locale={locale}
        />
        <TermControls
          locale={locale}
          sponsorId={sponsor.sponsorId}
          term={term}
          terms={sponsor.terms}
          actor={context.actor}
        />
      </>
    );
  } else {
    const options = await termOptions(context);
    content = (
      <>
        <h2 className="text-xl font-semibold">{t('terms')}</h2>
        {sponsor.terms.length === 0 ? (
          <p>{t('emptyTerms')}</p>
        ) : (
          sponsor.terms.map(term => (
            <section key={term.termId} className="rounded-lg border p-4 space-y-3">
              <TermSummary term={term} locale={locale} />
              <Link
                className="underline"
                href={`${base}/${sponsor.sponsorId}/terms/${term.termId}`}
              >
                {t('openTerm')}
              </Link>
            </section>
          ))
        )}
        <ActionForm
          operation="createTerm"
          target={{ sponsorId: sponsor.sponsorId }}
          disabledReason={
            options.plans.length === 0 || options.entities.length === 0
              ? t('noTermOptions')
              : undefined
          }
        >
          <p>{t('dateHelp')}</p>
          <Field name="termStart" type="datetime-local" />
          <Field name="termEnd" type="datetime-local" />
          <Choice name="planKey" options={options.plans} />
          <Choice name="legalEntityId" options={options.entities} />
          <RevisionFields />
        </ActionForm>
      </>
    );
  }
  return (
    <main
      data-testid={`${area}-sponsors${termId ? '-roster' : sponsorId ? '-detail' : ''}-page-ready`}
      className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8"
    >
      <h1 className="text-2xl font-bold">{sponsor?.legalName ?? t('title')}</h1>
      {area !== 'agent' && !sponsorId && <SponsorTasksLink area={area} />}
      {sponsor && (
        <nav className="flex flex-wrap gap-x-4 gap-y-1">
          <Link className="underline" href={base}>
            {t('backToSponsors')}
          </Link>
          {termId && (
            <Link className="underline" href={`${base}/${sponsor.sponsorId}`}>
              {t('backToSponsor')}
            </Link>
          )}
        </nav>
      )}
      {content}
    </main>
  );
}
