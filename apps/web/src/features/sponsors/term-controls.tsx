import {
  canDecideRevision,
  isSponsorStaff,
  type SponsorActor,
} from '@interdomestik/domain-membership-billing/sponsors/access';
import type { SponsorTermView } from '@interdomestik/domain-membership-billing/sponsors/roster-view';
import { getTranslations } from 'next-intl/server';
import { ActionForm } from './action-form';
import { Field, RevisionFields } from './fields';
import { hasSuccessor } from './actions.core';

export async function TermControls({
  sponsorId,
  term,
  terms,
  actor,
  locale,
}: Readonly<{
  sponsorId: string;
  term: SponsorTermView;
  terms: SponsorTermView[];
  actor: SponsorActor;
  locale: string;
}>): Promise<React.JSX.Element> {
  const t = await getTranslations({ locale, namespace: 'sponsors' });
  const target = { sponsorId, termId: term.termId };
  const latest = term.revisions[0];
  const successor = hasSuccessor(term, terms);
  const earliest = new Date(Math.max(Date.now() + 86_400_000, term.termStart.getTime()));
  let terminationDisabledReason: string | undefined;
  if (!canDecideRevision(actor, term.createdBy))
    terminationDisabledReason = t('creatorCannotDecide');
  else if (term.terminatedEffectiveAt) terminationDisabledReason = t('terminated');
  else if (successor) terminationDisabledReason = t('successorFirst');
  else if (earliest > term.termEnd) terminationDisabledReason = t('terminationTooLate');

  return (
    <div className="space-y-4">
      <ActionForm
        operation="addRevision"
        target={target}
        disabledReason={latest?.decision === null ? t('pendingRevision') : undefined}
      >
        <RevisionFields minimum={term.seatCount ?? 1} />
      </ActionForm>
      <h3 className="font-semibold">{t('revisions')}</h3>
      {term.revisions.map(revision => (
        <div key={revision.revisionId} className="rounded-lg border p-4 space-y-2">
          <p>
            {t('revisionSummary', {
              revision: revision.revision,
              seats: revision.seatCount,
              price: revision.pricePerSeatMinor,
              currency: revision.currency,
            })}
          </p>
          <p>
            {t('fields.contractReference')}: {revision.contractReference}
          </p>
          <p>
            {t('fields.termsVersion')}: {revision.termsVersion}
          </p>
          <p>{t(`decisions.${revision.decision ?? 'pending'}`)}</p>
          {isSponsorStaff(actor) &&
            revision.revisionId === latest?.revisionId &&
            revision.decision === null && (
              <ActionForm
                operation="decideRevision"
                target={{ ...target, revisionId: revision.revisionId }}
                disabledReason={
                  canDecideRevision(actor, revision.createdBy)
                    ? undefined
                    : t('creatorCannotDecide')
                }
              >
                <Field name="invoiceReference" required={false} />
                <label className="flex gap-2">
                  <input type="radio" name="decision" value="approved" required />
                  {t('decisions.approved')}
                </label>
                <label className="flex gap-2">
                  <input type="radio" name="decision" value="rejected" required />
                  {t('decisions.rejected')}
                </label>
              </ActionForm>
            )}
        </div>
      ))}
      {isSponsorStaff(actor) && (
        <ActionForm
          operation="terminateTerm"
          target={target}
          disabledReason={terminationDisabledReason}
        >
          <p>{t('terminationRules')}</p>
          <p>
            {t('terminationWindow', {
              start: earliest.toISOString(),
              end: term.termEnd.toISOString(),
            })}
          </p>
          <Field name="effectiveAt" type="datetime-local" />
        </ActionForm>
      )}
    </div>
  );
}
