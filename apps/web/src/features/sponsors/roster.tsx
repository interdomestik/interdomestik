import type { RosterView } from '@interdomestik/domain-membership-billing/sponsors/roster-view';
import { MAX_UPLOAD_ROWS } from '@interdomestik/domain-membership-billing/sponsors/roster-upload';
import { getTranslations } from 'next-intl/server';
import { ActionForm } from './action-form';

export async function SponsorRoster({
  roster,
  uploadEnabled,
  locale,
}: {
  roster: RosterView;
  uploadEnabled: boolean;
  locale: string;
}): Promise<React.JSX.Element> {
  const t = await getTranslations({ locale, namespace: 'sponsors' });
  const target = { sponsorId: roster.sponsorId, termId: roster.term.termId };
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">{t('roster')}</h2>
      <p>{t('seatsUsed', { used: roster.entries.length, seats: roster.term.seatCount ?? 0 })}</p>
      <ul>
        {Object.entries(roster.counts).map(([status, count]) => (
          <li key={status}>
            {t(`statuses.${status}`)}: {count}
          </li>
        ))}
      </ul>
      <p>{t('seatContinues')}</p>
      {!uploadEnabled ? (
        <p role="status">{t('uploadDark')}</p>
      ) : !roster.term.effective ? (
        <p>{t('approvalRequired')}</p>
      ) : (
        <ActionForm operation="uploadRoster" target={target}>
          <p>{t('csvHelp', { max: MAX_UPLOAD_ROWS })}</p>
          <label className="block space-y-2">
            <span>{t('fields.csv')}</span>
            <input
              className="block max-w-full"
              type="file"
              name="csv"
              accept=".csv,text/csv"
              required
            />
          </label>
        </ActionForm>
      )}
      {roster.entries.length === 0 ? (
        <p>{t('emptyRoster')}</p>
      ) : (
        <ul className="space-y-3">
          {roster.entries.map(entry => (
            <li key={entry.entryId} className="rounded-lg border p-4 space-y-2 break-words">
              <p>
                {entry.firstName ?? t('erased')} {entry.lastName ?? t('erased')}
              </p>
              <p>{entry.email ?? t('erased')}</p>
              <p>{t(`statuses.${entry.status}`)}</p>
              {entry.leftCompany ? (
                <p>{t('leftCompany')}</p>
              ) : (
                roster.term.effective && (
                  <ActionForm
                    operation="markLeftCompany"
                    target={{ ...target, entryId: entry.entryId }}
                  />
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
