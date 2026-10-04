import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';

import { PRIMARY_ACTION_CLASS, SECONDARY_ACTION_CLASS } from './organizer-styles';
import type { DraftState, FreeStartCopy, StepId } from './types';

type Props = Readonly<{
  categoryLabel: string;
  draft: DraftState;
  issueLabel: string;
  isFinishing: boolean;
  outcomeLabel: string;
  /**
   * True only where an admitted neutral vehicle or property save actually replaces this as the
   * primary action. Injury, flight and non-neutral hosts keep the summary primary.
   */
  secondaryFinish?: boolean;
  step: StepId;
  t: FreeStartCopy;
  /**
   * The full temporary-result and service-limit explanation, shown with the optional summary
   * action before it generates anything. It is not repeated while facts are still being entered.
   */
  truthBody: string;
  onBack: () => void;
  onFinish: () => void;
}>;

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[#001a33]/12 pb-3">
      <dt className="text-xs font-bold uppercase tracking-[0.14em] text-[#627081]">{label}</dt>
      <dd className="mt-1 text-base font-semibold leading-6 text-[#001a33]">{value}</dd>
    </div>
  );
}

export function PreviewStep(props: Props) {
  const missing = props.t('preview.notProvided');

  return (
    <>
      <dl className="grid gap-4 rounded-2xl border border-[#001a33]/15 bg-white p-5 sm:grid-cols-2">
        <Fact label={props.t('preview.categoryLabel')} value={props.categoryLabel} />
        <Fact label={props.t('preview.issueLabel')} value={props.issueLabel} />
        <Fact label={props.t('preview.dateLabel')} value={props.draft.incidentDate || missing} />
        <Fact
          label={props.t('preview.counterpartyLabel')}
          value={props.draft.counterparty || missing}
        />
        <Fact label={props.t('preview.outcomeLabel')} value={props.outcomeLabel} />
        <Fact label={props.t('preview.summaryLabel')} value={props.draft.summary || missing} />
      </dl>
      <div className="rounded-2xl bg-[#e2f2ef] p-5 text-[#173b43]">
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#006b6e]">
          {props.t('preview.includesHeading')}
        </p>
        <ul className="mt-3 space-y-2">
          {(['summary', 'timeline', 'handoff'] as const).map(item => (
            <li key={item} className="flex items-start gap-3 text-sm leading-6">
              <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#007f82]" />
              <span>{props.t(`preview.includes.${item}`)}</span>
            </li>
          ))}
        </ul>
      </div>
      {props.step === 'preview' ? (
        <p
          id="free-start-preview-truth"
          data-testid="free-start-preview-truth"
          className="text-sm leading-6 text-[#33485c]"
        >
          {props.truthBody}
        </p>
      ) : null}
      {props.step === 'preview' ? (
        <div className="flex flex-wrap justify-between gap-3">
          <button type="button" onClick={props.onBack} className={SECONDARY_ACTION_CLASS}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {props.t('preview.back')}
          </button>
          <button
            type="button"
            data-testid="free-start-preview-finish"
            data-emphasis={props.secondaryFinish ? 'secondary' : 'primary'}
            disabled={props.isFinishing}
            aria-busy={props.isFinishing}
            aria-describedby="free-start-preview-truth"
            onClick={props.onFinish}
            className={props.secondaryFinish ? SECONDARY_ACTION_CLASS : PRIMARY_ACTION_CLASS}
          >
            {props.isFinishing ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : null}
            {props.t('preview.finish')}
            {!props.isFinishing ? <ArrowRight aria-hidden="true" className="h-4 w-4" /> : null}
          </button>
        </div>
      ) : null}
    </>
  );
}
