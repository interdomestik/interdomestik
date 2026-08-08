'use client';

import { SecureSaveBand } from '@/app/[locale]/components/home/free-start-intake-shell/secure-save-band';
import {
  getIssueIds,
  getSelectedCategoryLabel,
  getSelectedIssueLabel,
  getSelectedOutcomeLabel,
} from '@/app/[locale]/components/home/free-start-intake-shell/helpers';
import type { CategoryId } from '@/app/[locale]/components/home/free-start-intake-shell/types';
import { useDraftLifecycle } from '@/app/[locale]/components/home/free-start-intake-shell/use-draft-lifecycle';
import { useOrganizerFlow } from '@/app/[locale]/components/home/free-start-intake-shell/use-organizer-flow';
import { NextIntlClientProvider, useTranslations, type AbstractIntlMessages } from 'next-intl';

// prettier-ignore
import { parseClaimDraftCopy, type ClaimDraftCopy, type SavedDraftSubmitCopy } from './dormant-preview';
import { ClaimDraftMainPanel } from './main-panel';

// prettier-ignore
type HandoffContext = Readonly<{ source: 'diaspora-green-card'; country: 'DE' | 'CH' | 'AT' | 'IT'; incidentLocation: 'abroad' }>;
// prettier-ignore
type Props = Readonly<{ freeStartMessages: AbstractIntlMessages; handoffContext?: HandoffContext | null; initialCategory?: string; locale: string; managerOnly?: boolean; neutralOtpHost?: string | null; tenantId: string }>;

// prettier-ignore
type BodyProps = Omit<Props, 'freeStartMessages'> & Readonly<{ copy: ClaimDraftCopy; handoffCountryLabel: string | null; submitCopy: SavedDraftSubmitCopy; t: (key: string) => string }>;

function supportedCategory(value?: string): CategoryId | undefined {
  if (value === 'auto' || value === 'vehicle') return 'vehicle';
  return value === 'property' ? 'property' : undefined;
}

// prettier-ignore
function ClaimDraftIntakeBody({ copy, handoffContext, handoffCountryLabel, initialCategory, locale, managerOnly, neutralOtpHost, submitCopy, t, tenantId }: BodyProps) {
  const tFree = useTranslations('freeStart');
  const flow = useOrganizerFlow(supportedCategory(initialCategory));
  const isUnsupportedTravel = initialCategory === 'travel';
  const lifecycle = useDraftLifecycle({
    category: flow.selectedCategory,
    draft: flow.draft,
    onReset: flow.resetDraft,
    onResume: flow.resumeDraft,
    step: flow.step,
  });
  const issueIds = getIssueIds(flow.selectedCategory);
  const labels = {
    category: getSelectedCategoryLabel(tFree, flow.selectedCategory),
    issue: getSelectedIssueLabel(tFree, flow.selectedCategory, flow.draft.issueType),
    outcome: getSelectedOutcomeLabel(tFree, flow.draft.desiredOutcome),
  };
  const saveBandProps = { lifecycle, locale, manageOnly: managerOnly, neutralOtpHost, tenantId };

  // prettier-ignore
  return (
<section
data-testid="claim-draft-intake"
data-save-behavior="explicit-only"
className="mx-auto max-w-5xl space-y-6"
>
<header className="space-y-3">
<h2 className="text-3xl font-bold tracking-tight text-[#001a33]">{copy.heading}</h2>
<p className="text-lg text-[#365265]">{copy.supporting}</p>
</header>
{!(!managerOnly && (flow.step === 'preview' || flow.step === 'complete') && lifecycle.active?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(lifecycle.active.id) && lifecycle.active.version && !lifecycle.hasUnsavedChanges && [flow.draft.issueType, flow.draft.incidentDate, flow.draft.counterparty, flow.draft.desiredOutcome, flow.draft.summary].every(value => value.trim())) ? <div className="rounded-2xl border border-[#006f72]/30 bg-[#eaf5f2] p-4 text-sm font-semibold leading-6 text-[#173b43]">
{copy.truth}
</div> : null}
{isUnsupportedTravel && <p data-testid="claim-draft-travel">{copy.unsupported}</p>}
{handoffContext ? (
<aside
data-testid="claim-wizard-handoff"
className="rounded-2xl border border-slate-200 bg-white p-4"
aria-label={t('wizard.handoff.title')}
>
<h3 className="font-bold text-[#001a33]">{t('wizard.handoff.title')}</h3>
<dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
<div>
<dt className="text-[#526274]">{t('wizard.handoff.sourceLabel')}</dt>
<dd>{t('wizard.handoff.sourceValue')}</dd>
</div>
<div>
<dt className="text-[#526274]">{t('wizard.handoff.countryLabel')}</dt>
<dd>{handoffCountryLabel}</dd>
</div>
<div>
<dt className="text-[#526274]">{t('wizard.handoff.incidentLocationLabel')}</dt>
<dd>{t('wizard.handoff.incidentLocationValue')}</dd>
</div>
</dl>
</aside>
) : null}
{flow.validationError ? (
<p
ref={flow.validationErrorRef}
role="alert"
tabIndex={-1}
className="rounded-xl border border-rose-300 bg-rose-50 p-3 font-semibold text-rose-900"
>
{flow.validationError}
</p>
) : null}
{!managerOnly || lifecycle.active ? (
<ClaimDraftMainPanel
activeDraftId={lifecycle.active?.id}
activeDraftVersion={lifecycle.active?.version}
copy={copy}
flow={flow}
hasUnsavedChanges={lifecycle.hasUnsavedChanges}
issueIds={issueIds}
labels={labels}
managerOnly={managerOnly}
neutralOtpHost={neutralOtpHost}
submitCopy={submitCopy}
tFree={tFree}
/>
) : null}
<SecureSaveBand {...saveBandProps} />
</section>
);
}

export function ClaimDraftIntake({ freeStartMessages, ...props }: Props) {
  const t = useTranslations('claims');
  const tDiaspora = useTranslations('diaspora');
  const copy = parseClaimDraftCopy(t.raw('draftIntakeCopy'));
  // prettier-ignore
  const handoffCountryLabel = props.handoffContext ? tDiaspora(`selector.options.${props.handoffContext.country}`) : null;
  // prettier-ignore
  const submitCopy = { failed: t('wizard.submit_failed'), goToClaim: t('success.go_to_claim'), label: t('wizard.submit_label'), success: t('wizard.submit_success'), unexpected: t('wizard.submit_unexpected') };
  // prettier-ignore
  return (
<NextIntlClientProvider locale={props.locale} messages={freeStartMessages}>
<ClaimDraftIntakeBody
{...props}
copy={copy}
handoffCountryLabel={handoffCountryLabel}
submitCopy={submitCopy}
t={t}
/>
</NextIntlClientProvider>
);
}
