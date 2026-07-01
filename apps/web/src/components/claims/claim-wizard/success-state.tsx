import * as React from 'react';
import type { useTranslations } from 'next-intl';

import { PhoneCall, Sparkles } from 'lucide-react';

type SupportContacts = {
  telHref: `tel:${string}`;
  whatsappHref?: `https://${string}` | null;
};

export function ClaimCreatedSuccess(
  props: Readonly<{
    claimId: string;
    claimNumber: string;
    locale: string;
    contacts: SupportContacts;
    tSuccess: ReturnType<typeof useTranslations>;
  }>
): React.JSX.Element {
  const { claimId, claimNumber, locale, contacts, tSuccess } = props;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div
        data-testid="claim-created-success"
        className="space-y-4 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-cyan-50 p-6 text-emerald-950 shadow-[0_22px_46px_-34px_rgba(5,150,105,0.9)]"
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/80 bg-white/70 px-3 py-1 text-xs font-semibold text-emerald-800">
          <Sparkles className="h-3.5 w-3.5" />
          {tSuccess('title')}
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">{tSuccess('title')}</h2>
        <p data-testid="claim-created-id">
          {tSuccess('case_id')}: <span className="font-mono font-semibold">{claimNumber}</span>
        </p>
        <ul
          data-testid="claim-created-next-steps"
          className="list-disc space-y-1 pl-5 text-sm leading-6"
        >
          <li>{tSuccess('next_step_1')}</li>
          <li>{tSuccess('next_step_2')}</li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <a
            data-testid="claim-created-help-call"
            href={contacts.telHref}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white/80 px-4 py-2 text-sm font-medium text-emerald-900 transition hover:bg-white"
          >
            <PhoneCall className="h-4 w-4" />
            {tSuccess('help_call')}
          </a>
          {contacts.whatsappHref ? (
            <a
              data-testid="claim-created-help-whatsapp"
              href={contacts.whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-300 bg-white/80 px-4 py-2 text-sm font-medium text-emerald-900 transition hover:bg-white"
            >
              {tSuccess('help_whatsapp')}
            </a>
          ) : null}
        </div>
        <a
          data-testid="claim-created-go-to-claim"
          href={`/${locale}/member/claims/${claimId}`}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          {tSuccess('go_to_claim')}
        </a>
      </div>
    </div>
  );
}
