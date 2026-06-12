import { CommercialDisclaimerNotice } from '@/components/commercial/commercial-disclaimer-notice';
import { Button } from '@interdomestik/ui';
import { ChevronLeft, Phone, QrCode, ShieldCheck, Wallet } from 'lucide-react';
import Link from 'next/link';

import type { MemberCardSubscription } from './membership-card-subscription';

type TranslationFn = (key: string) => string;

interface MembershipCardProps {
  readonly locale: string;
  readonly memberName: string | null | undefined;
  readonly memberNumber: string;
  readonly memberSince: Date | string;
  readonly subscription: MemberCardSubscription;
  readonly t: TranslationFn;
}

export function MembershipCard({
  locale,
  memberName,
  memberNumber,
  memberSince,
  subscription,
  t,
}: MembershipCardProps) {
  return (
    <div
      data-testid="member-membership-card-ready"
      className="min-h-[80vh] flex flex-col items-center justify-center p-4 py-8 animate-fade-in"
    >
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href={`/${locale}/member`}>
              <ChevronLeft className="mr-2 h-4 w-4" />
              {t('back_to_dashboard')}
            </Link>
          </Button>
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
            {subscription.planId.toUpperCase()}
          </span>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground text-sm px-4">{t('description')}</p>
        </div>

        <div className="relative group cursor-pointer perspective-1000">
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-[2rem] p-8 text-white shadow-2xl relative overflow-hidden aspect-[1.586/1] border border-white/10 ring-1 ring-white/20">
            <div className="absolute top-0 left-0 right-0 h-2/3 bg-gradient-to-b from-white/10 to-transparent skew-y-[-12deg] origin-top-left -translate-y-4" />
            <div className="absolute -inset-2 bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-30 group-hover:translate-x-full duration-1000 transition-transform" />

            <div className="flex justify-between items-start relative z-10">
              <div className="flex flex-col">
                <span className="text-[10px] font-black tracking-[0.2em] opacity-60 uppercase mb-1">
                  Interdomestik
                </span>
                <span className="text-xs font-bold tracking-widest opacity-90 uppercase">
                  Service Club
                </span>
              </div>
              <div className="bg-white/10 backdrop-blur-md p-2 rounded-2xl border border-white/20">
                <ShieldCheck className="w-6 h-6 text-primary" />
              </div>
            </div>

            <div className="mt-10 relative z-10">
              <div className="text-[10px] font-bold opacity-40 uppercase tracking-widest mb-1.5">
                {t('subtitle')}
              </div>
              <div className="text-2xl font-mono tracking-[0.15em] font-medium drop-shadow-md">
                {memberNumber}
              </div>
            </div>

            <div className="mt-auto flex justify-between items-end relative z-10">
              <div className="flex flex-col gap-0.5">
                <div className="text-[10px] font-bold opacity-40 uppercase tracking-widest">
                  Member
                </div>
                <div className="text-xl font-bold tracking-tight">{memberName}</div>
              </div>
              <div className="bg-white p-2 rounded-xl shadow-inner border border-white/20 group-hover:scale-105 transition-transform">
                <QrCode className="w-10 h-10 text-slate-900" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <InfoTile
            label={t('member_since')}
            value={new Date(memberSince).toLocaleDateString(locale)}
          />
          <InfoTile
            label={t('valid_thru')}
            value={
              subscription.currentPeriodEnd
                ? new Date(subscription.currentPeriodEnd).toLocaleDateString(locale)
                : 'N/A'
            }
          />
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <Button
            size="lg"
            className="h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 shadow-xl shadow-slate-900/10"
          >
            <Wallet className="mr-3 h-5 w-5" />
            Add to Wallet
          </Button>
          <Button variant="outline" size="lg" className="h-14 rounded-2xl border-2">
            <Phone className="mr-3 h-5 w-5" />
            {t('emergency_hotline')}
          </Button>
          <CommercialDisclaimerNotice
            sectionTestId="member-card-hotline-disclaimer"
            items={[{ title: t('hotline_disclaimer.title'), body: t('hotline_disclaimer.body') }]}
          />
        </div>
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="bg-white p-4 rounded-2xl border shadow-sm flex flex-col gap-1">
      <span className="text-[10px] font-bold text-muted-foreground uppercase">{label}</span>
      <span className="text-sm font-bold">{value}</span>
    </div>
  );
}
