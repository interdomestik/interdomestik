import type { ClaimPack } from '@interdomestik/domain-claims/claim-pack';
import dynamic from 'next/dynamic';

import { CompletionIntro, CompletionSummary } from './completion-summary';
import { TrustGuidance } from './trust-guidance';
import type { CategoryId, ConfidenceLevel, FreeStartCopy, StepId, SupportContacts } from './types';

const ClaimPackResult = dynamic(
  () => import('../claim-pack-result').then(module => module.ClaimPackResult),
  { ssr: false, loading: () => <div className="h-32 animate-pulse rounded-2xl bg-[#eaf1f4]" /> }
);

type Props = Readonly<{
  claimPack: ClaimPack | null;
  confidenceLevel: ConfidenceLevel;
  contacts: SupportContacts;
  continueHref: string;
  continueLabel: string;
  selectedCategory: CategoryId | null;
  step: StepId;
  t: FreeStartCopy;
}>;

function SupportIntro({ t }: { t: FreeStartCopy }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8a5a00]">
        {t('support.badge')}
      </p>
      <h3 className="text-xl font-bold leading-7 text-[#001a33]">{t('support.heading')}</h3>
      <p className="text-sm leading-6 text-[#526274]">{t('support.body')}</p>
      <ul className="space-y-2 text-sm leading-6 text-[#33485c]">
        {(['lane', 'facts', 'handoff'] as const).map(item => (
          <li key={item} className="border-l-2 border-[#008f91]/60 pl-3">
            {t(`support.points.${item}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FreeStartSidebar(props: Props) {
  if (props.step === 'complete' && props.claimPack) {
    return (
      <div data-testid="free-start-complete" className="space-y-5">
        <CompletionIntro t={props.t} />
        <ClaimPackResult
          ctaHref={props.continueHref}
          ctaLabel={props.continueLabel}
          pack={props.claimPack}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {props.step === 'complete' ? (
        <CompletionSummary
          confidenceLevel={props.confidenceLevel}
          contacts={props.contacts}
          continueHref={props.continueHref}
          continueLabel={props.continueLabel}
          t={props.t}
        />
      ) : (
        <SupportIntro t={props.t} />
      )}
      <TrustGuidance selectedCategory={props.selectedCategory} t={props.t} />
    </div>
  );
}
