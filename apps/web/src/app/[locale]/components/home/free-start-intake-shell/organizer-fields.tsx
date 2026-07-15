import { OUTCOME_IDS } from './constants';
import type { DraftState, FreeStartCopy, IssueId, SetDraftField } from './types';

const CONTROL_CLASS =
  'min-h-12 w-full rounded-xl border border-[#001a33]/25 bg-white px-3 py-2 text-base text-[#001a33] outline-none transition placeholder:text-[#6d7a88] focus-visible:border-[#008f91] focus-visible:ring-3 focus-visible:ring-[#008f91]/25';

type Props = Readonly<{
  draft: DraftState;
  issueIds: ReadonlyArray<IssueId>;
  selectedCategory: string;
  setDraftField: SetDraftField;
  t: FreeStartCopy;
}>;

export function OrganizerFields({ draft, issueIds, selectedCategory, setDraftField, t }: Props) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="space-y-2 text-base font-semibold text-[#001a33]">
        <span>{t('details.issueType')}</span>
        <select
          aria-label={t('details.issueType')}
          value={draft.issueType}
          onChange={event =>
            setDraftField('issueType', event.target.value as DraftState['issueType'])
          }
          className={CONTROL_CLASS}
        >
          <option value="">{t('details.selectPlaceholder')}</option>
          {issueIds.map(issueId => (
            <option key={issueId} value={issueId}>
              {t(`issues.${selectedCategory}.${issueId}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-2 text-base font-semibold text-[#001a33]">
        <span>{t('details.incidentDate')}</span>
        <input
          aria-label={t('details.incidentDate')}
          type="date"
          value={draft.incidentDate}
          onChange={event => setDraftField('incidentDate', event.target.value)}
          className={CONTROL_CLASS}
        />
      </label>
      <label className="space-y-2 text-base font-semibold text-[#001a33]">
        <span>{t('details.counterparty')}</span>
        <input
          aria-label={t('details.counterparty')}
          type="text"
          value={draft.counterparty}
          onChange={event => setDraftField('counterparty', event.target.value)}
          placeholder={t('details.counterpartyPlaceholder')}
          className={CONTROL_CLASS}
        />
      </label>
      <label className="space-y-2 text-base font-semibold text-[#001a33]">
        <span>{t('details.desiredOutcome')}</span>
        <select
          aria-label={t('details.desiredOutcome')}
          value={draft.desiredOutcome}
          onChange={event =>
            setDraftField('desiredOutcome', event.target.value as DraftState['desiredOutcome'])
          }
          className={CONTROL_CLASS}
        >
          <option value="">{t('details.selectPlaceholder')}</option>
          {OUTCOME_IDS.map(outcomeId => (
            <option key={outcomeId} value={outcomeId}>
              {t(`outcomes.${outcomeId}`)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
