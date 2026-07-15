import { Link } from '@/i18n/routing';
import { ArrowRight, CheckCircle2, PhoneCall } from 'lucide-react';

import { PRIMARY_ACTION_CLASS, SECONDARY_ACTION_CLASS } from './organizer-styles';
import type { ConfidenceLevel, FreeStartCopy, SupportContacts } from './types';

type Props = Readonly<{
  confidenceLevel: ConfidenceLevel;
  contacts: SupportContacts;
  continueHref: string;
  continueLabel: string;
  t: FreeStartCopy;
}>;

function confidenceClass(level: ConfidenceLevel) {
  const base =
    'inline-flex rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide';
  if (level === 'high') return `${base} border-[#008f91] bg-[#e2f2ef] text-[#005f62]`;
  if (level === 'medium') return `${base} border-[#b77a08] bg-[#fff2cf] text-[#704700]`;
  return `${base} border-[#a63d50] bg-[#fff0f2] text-[#7f2436]`;
}

export function CompletionIntro({ t }: { t: FreeStartCopy }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#007f82]">
        <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
        {t('completion.badge')}
      </div>
      <h3 className="text-2xl font-bold text-[#001a33]">{t('completion.heading')}</h3>
      <p className="text-sm leading-6 text-[#526274]">{t('completion.body')}</p>
    </div>
  );
}

export function CompletionSummary(props: Props) {
  const hotlineFirst = props.confidenceLevel === 'low';
  return (
    <div data-testid="free-start-complete-pending-pack" className="space-y-5">
      <CompletionIntro t={props.t} />
      <div className="rounded-2xl bg-[#eaf1f4] p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#526274]">
          {props.t('completion.confidence.eyebrow')}
        </p>
        <span
          data-testid="free-start-confidence-level"
          className={confidenceClass(props.confidenceLevel)}
        >
          {props.t(`completion.confidence.levels.${props.confidenceLevel}.label`)}
        </span>
        <p className="mt-2 text-sm leading-6 text-[#33485c]">
          {props.t(`completion.confidence.levels.${props.confidenceLevel}.body`)}
        </p>
      </div>
      <div data-testid="free-start-next-step" className="border-l-2 border-[#008f91] pl-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#007f82]">
          {props.t('completion.nextStep.heading')}
        </p>
        <p className="mt-2 text-sm leading-6 text-[#33485c]">
          {props.t(`completion.nextStep.levels.${props.confidenceLevel}`)}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {hotlineFirst ? (
          <a href={props.contacts.telHref} className={PRIMARY_ACTION_CLASS}>
            <PhoneCall aria-hidden="true" className="h-4 w-4" />
            {props.t('completion.cta.hotline.low')}
          </a>
        ) : (
          <Link href={props.continueHref} className={PRIMARY_ACTION_CLASS}>
            {props.continueLabel}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        )}
        {hotlineFirst ? (
          <Link href={props.continueHref} className={SECONDARY_ACTION_CLASS}>
            {props.continueLabel}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        ) : (
          <a href={props.contacts.telHref} className={SECONDARY_ACTION_CLASS}>
            <PhoneCall aria-hidden="true" className="h-4 w-4" />
            {props.t('completion.cta.hotline.secondary')}
          </a>
        )}
      </div>
    </div>
  );
}
