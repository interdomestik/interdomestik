import { Headphones, ShieldCheck, Zap } from 'lucide-react';

import { DigitalIDCard } from '@/app/[locale]/components/home/digital-id-card';

import type { DashboardTranslator } from './types';

export function DashboardHero({
  heroSubtitle,
  isActive,
  memberNumber,
  supportStatusLabel,
  tLanding,
  userName,
  validThru,
}: Readonly<{
  heroSubtitle: string;
  isActive: boolean;
  memberNumber: string | null | undefined;
  supportStatusLabel: string;
  tLanding: DashboardTranslator;
  userName: string;
  validThru: string;
}>) {
  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-sky-50/70 p-8 shadow-xl sm:p-10 dark:border-white/10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-12">
        <div className="flex flex-col gap-8 max-w-xl">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-4 py-1.5 text-sky-700 shadow-sm dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300">
              <div
                className={`flex h-2 w-2 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-amber-500'}`}
              />
              <span
                className="text-[10px] font-black uppercase tracking-[0.2em]"
                data-testid="dashboard-heading"
              >
                {tLanding('page_title')}
              </span>
            </div>

            <h1 className="text-4xl font-display font-black tracking-tight text-slate-950 md:text-6xl dark:text-white">
              {tLanding('hero_greeting')},
              <br />
              <span className="bg-gradient-to-r from-sky-600 to-blue-700 bg-clip-text text-transparent italic">
                {userName.split(' ')[0]}
              </span>
            </h1>
            <p className="text-lg font-medium leading-relaxed text-slate-600 dark:text-slate-300">
              {heroSubtitle}
            </p>
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-5 py-3 shadow-sm dark:border-white/10 dark:bg-white/5">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {tLanding('status_label')}
                </span>
                <span className="text-sm font-black uppercase tracking-tighter text-slate-950 dark:text-white">
                  {supportStatusLabel}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-5 py-3 shadow-sm dark:border-white/10 dark:bg-white/5">
              <Headphones className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {tLanding('response_label')}
                </span>
                <span className="text-sm font-black uppercase tracking-tighter text-slate-950 dark:text-white">
                  {tLanding('response_value')}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-5 py-3 shadow-sm dark:border-white/10 dark:bg-white/5">
              <Zap className="w-5 h-5 text-amber-500" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {tLanding('card_ready_label')}
                </span>
                <span className="text-sm font-black uppercase tracking-tighter text-slate-950 dark:text-white">
                  {tLanding('card_ready_value')}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 animate-in fade-in zoom-in-95 duration-1000 delay-300">
          <DigitalIDCard
            name={userName}
            memberNumber={memberNumber || 'PENDING'}
            validThru={validThru}
            isActive={isActive}
            labels={{
              membership: tLanding('card_membership'),
              claimSupport: tLanding('card_claim_support'),
              legalProtection: tLanding('card_legal_protection'),
              assistance247: tLanding('card_assistance_247'),
              memberName: tLanding('card_member_name'),
              validThru: tLanding('card_valid_thru'),
              activeMember: tLanding('card_active_member'),
              protectionPaused: tLanding('card_protection_paused'),
              addToAppleWallet: tLanding('card_add_to_apple_wallet'),
              googlePayReady: tLanding('card_google_pay_ready'),
            }}
          />
        </div>
      </div>
    </div>
  );
}
