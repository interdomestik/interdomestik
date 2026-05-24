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
    <div className="relative min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6 dark:border-white/10 dark:bg-slate-950/60">
      <div className="relative z-10 flex min-w-0 flex-col justify-between gap-6 lg:flex-row lg:items-center">
        <div className="flex min-w-0 max-w-xl flex-col gap-5">
          <div className="space-y-3">
            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300">
              <div
                className={`flex h-2 w-2 shrink-0 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-amber-500'}`}
              />
              <span className="min-w-0 break-words text-[10px] font-black uppercase tracking-[0.16em]">
                {tLanding('page_title')}
              </span>
            </div>

            <h3 className="break-words text-2xl font-display font-black tracking-tight text-slate-950 md:text-3xl dark:text-white">
              {tLanding('hero_greeting')},
              <span className="ml-2 break-words text-sky-700 dark:text-sky-300">
                {userName.split(' ')[0]}
              </span>
            </h3>
            <p className="break-words text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-300 sm:text-base">
              {heroSubtitle}
            </p>
          </div>

          <div className="flex min-w-0 flex-wrap gap-3">
            <div className="flex min-w-0 max-w-full items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" />
              <div className="flex min-w-0 flex-col">
                <span className="break-words text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                  {tLanding('status_label')}
                </span>
                <span className="break-words text-sm font-black uppercase text-slate-950 dark:text-white">
                  {supportStatusLabel}
                </span>
              </div>
            </div>
            <div className="flex min-w-0 max-w-full items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
              <Headphones className="h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" />
              <div className="flex min-w-0 flex-col">
                <span className="break-words text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                  {tLanding('response_label')}
                </span>
                <span className="break-words text-sm font-black uppercase text-slate-950 dark:text-white">
                  {tLanding('response_value')}
                </span>
              </div>
            </div>
            <div className="flex min-w-0 max-w-full items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
              <Zap className="h-5 w-5 shrink-0 text-amber-500" />
              <div className="flex min-w-0 flex-col">
                <span className="break-words text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                  {tLanding('card_ready_label')}
                </span>
                <span className="break-words text-sm font-black uppercase text-slate-950 dark:text-white">
                  {tLanding('card_ready_value')}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 max-w-full flex-shrink-0 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-700 lg:max-w-[460px]">
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
