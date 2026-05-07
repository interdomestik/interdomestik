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
    <Card className="lg:col-span-2 overflow-hidden rounded-[2rem] border border-slate-200/80 bg-slate-950 text-white shadow-lg dark:border-white/10">
      <CardHeader className="relative border-b border-white/10 p-8 pb-4">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-3 text-lg font-display font-black">
            <div className="rounded-lg bg-sky-500 p-2">
              <Phone className="h-5 w-5 text-white" />
            </div>
            {tLanding('command_center_title')}
          </CardTitle>
          <div className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-[10px] font-black tracking-widest text-sky-300">
            {tLanding('priority_line_active')}
          </div>
        </div>
      </CardHeader>

      <div className="relative flex flex-col gap-8 p-8 sm:p-10">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">
              {tLanding('support_phone_label')}
            </div>
            <a href={contacts.telHref} className="block text-3xl font-display font-black">
              {contacts.phoneDisplay}
            </a>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <span>
                {tLanding('available_now_avg_response', {
                  seconds: tLanding('response_value'),
                })}
              </span>
            </div>
          </div>
          <div className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">
              {tLanding('support_whatsapp_label')}
            </div>
            <a href={contacts.whatsappHref} className="block text-3xl font-display font-black">
              WhatsApp
            </a>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <span>{tLanding('support_whatsapp_value')}</span>
            </div>
          </div>
        </div>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-300">
          {tLanding('command_center_body')}
        </p>
      </div>
    </Card>
  );
}
