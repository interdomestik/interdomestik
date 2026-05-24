import { Card, CardHeader, CardTitle } from '@interdomestik/ui';
import { Phone } from 'lucide-react';

import type { SupportContacts } from '@/lib/support-contacts';

import type { DashboardTranslator } from './types';

export function CommandCenterCard({
  contacts,
  tLanding,
}: Readonly<{
  contacts: SupportContacts;
  tLanding: DashboardTranslator;
}>) {
  return (
    <Card className="min-w-0 overflow-hidden rounded-[2rem] border border-slate-200/80 bg-slate-950 text-white shadow-lg dark:border-white/10 lg:col-span-2">
      <CardHeader className="relative border-b border-white/10 p-8 pb-4">
        <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <CardTitle className="flex min-w-0 items-center gap-3 break-words text-lg font-display font-black">
            <div className="shrink-0 rounded-lg bg-sky-500 p-2">
              <Phone className="h-5 w-5 text-white" />
            </div>
            {tLanding('command_center_title')}
          </CardTitle>
          <div className="w-fit max-w-full break-words rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-[10px] font-black tracking-widest text-sky-300">
            {tLanding('priority_line_active')}
          </div>
        </div>
      </CardHeader>

      <div className="relative flex min-w-0 flex-col gap-8 p-8 sm:p-10">
        <div className="grid min-w-0 gap-6 sm:grid-cols-2">
          <div className="min-w-0 space-y-3 rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="break-words text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">
              {tLanding('support_phone_label')}
            </div>
            <a
              href={contacts.telHref}
              className="block break-words text-2xl font-display font-black sm:text-3xl"
            >
              {contacts.phoneDisplay}
            </a>
            <div className="flex min-w-0 items-center gap-2 text-xs text-slate-400">
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
              <span className="min-w-0 break-words">
                {tLanding('available_now_avg_response', {
                  seconds: tLanding('response_value'),
                })}
              </span>
            </div>
          </div>
          <div className="min-w-0 space-y-3 rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="break-words text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">
              {tLanding('support_whatsapp_label')}
            </div>
            <a
              href={contacts.whatsappHref}
              className="block break-words text-2xl font-display font-black sm:text-3xl"
            >
              WhatsApp
            </a>
            <div className="flex min-w-0 items-center gap-2 text-xs text-slate-400">
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
              <span className="min-w-0 break-words">{tLanding('support_whatsapp_value')}</span>
            </div>
          </div>
        </div>
        <p className="max-w-2xl break-words text-sm leading-relaxed text-slate-300">
          {tLanding('command_center_body')}
        </p>
      </div>
    </Card>
  );
}
