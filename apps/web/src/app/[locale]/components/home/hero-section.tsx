import { Link } from '@/i18n/routing';
import { contactInfo } from '@/lib/contact';
import { Button } from '@interdomestik/ui';
import { ArrowRight, CheckCircle2, Clock, Shield, ShieldCheck, Star, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DigitalIDCard } from './digital-id-card';

export function HeroSection() {
  const t = useTranslations('hero');
  const { phone, whatsapp } = contactInfo;
  const telHref = phone ? `tel:${phone.replace(/\s+/g, '')}` : undefined;

  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden bg-white pt-20">
      {/* Prime Background - Animated Mesh and Orbs */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-mesh opacity-40" />
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] animate-pulse-soft" />
        <div
          className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-secondary/10 rounded-full blur-[120px] animate-pulse-soft"
          style={{ animationDelay: '2s' }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,white_100%)] opacity-40" />
      </div>

      <div className="container mx-auto px-4 relative z-10 py-16 lg:py-24 flex flex-col items-center text-center">
        {/* Prime Status Badge */}
        <div className="inline-flex items-center gap-3 px-6 py-2 rounded-2xl bg-slate-900 border border-white/10 text-white text-sm font-black mb-12 shadow-2xl hover:scale-105 transition-transform cursor-default">
          <span className="text-emerald-400 font-bold uppercase tracking-wider">{t('badge')}</span>
          <div className="w-px h-4 bg-white/20" />
          <span className="opacity-90">€20 / VIT</span>
          <div className="w-px h-4 bg-white/20" />
          <div className="flex items-center gap-1">
            <Star className="h-4 w-4 fill-amber-300 text-amber-300" />
            <span className="opacity-90">4.9</span>
          </div>
        </div>

        {/* Prime Headline Lockup (Balanced Hierarchy) */}
        <div className="max-w-7xl mb-12 animate-fade-in group">
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-bold text-slate-900 tracking-tight leading-[1.1] mb-2">
            {t('title').split('?').slice(0, -1).join('?') + '?'}
          </h1>
          <div className="text-6xl md:text-8xl lg:text-9xl font-display font-black uppercase tracking-wide mb-8 leading-[1] relative inline-block">
            {/* Soft Glow Behind Text */}
            <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full opacity-50 pointer-events-none" />

            {/* Main Text with Premium Gradient */}
            <span className="relative bg-gradient-to-r from-[#0F172A] via-[#2563EB] to-[#0F172A] bg-clip-text text-transparent drop-shadow-xl saturate-150 animate-gradient-x">
              {t('title').split('?').slice(-1)[0]?.trim()}
            </span>
          </div>
          <p className="text-lg md:text-xl lg:text-2xl text-slate-600 max-w-4xl mx-auto font-medium leading-[1.5] opacity-90">
            {t('subtitle')}
          </p>
        </div>

        {/* Action Center */}
        <div className="flex flex-col items-center gap-10 w-full mb-16 animate-slide-up">
          <div className="flex flex-col sm:flex-row gap-5 items-center justify-center w-full max-w-4xl">
            <Link href="/register" className="w-full sm:w-auto">
              <Button
                size="xl"
                className="w-full sm:w-auto h-20 px-10 text-xl font-black rounded-2xl shadow-2xl shadow-primary/30 cta-press group overflow-hidden relative"
              >
                <div className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform [transition-duration:2000ms] bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
                <div className="flex flex-col items-center">
                  <span className="flex items-center gap-2">
                    {t('cta')}
                    <ArrowRight className="h-6 w-6 transition-transform group-hover:translate-x-1" />
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.2em] opacity-70 mt-1 font-bold">
                    AKTIVIM MENJËHERSHËM • €20/VIT
                  </span>
                </div>
              </Button>
            </Link>

            <div className="flex flex-wrap gap-4 justify-center w-full sm:w-auto">
              {telHref && (
                <a href={telHref} className="w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="xl"
                    className="w-full sm:w-auto h-20 px-8 bg-white/50 backdrop-blur-sm rounded-2xl border-slate-200 text-slate-800 hover:bg-slate-50 interactive-press"
                  >
                    <div className="flex flex-col items-start text-left">
                      <span className="text-[10px] text-primary font-black uppercase tracking-wider mb-1">
                        24/7 SUPPORT
                      </span>
                      <span className="text-lg font-black leading-none">{t('callNow')}</span>
                    </div>
                  </Button>
                </a>
              )}
              {whatsapp && (
                <a href={whatsapp} className="w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="xl"
                    className="w-full sm:w-auto h-20 px-8 bg-emerald-50/50 backdrop-blur-sm rounded-2xl border-emerald-100 text-emerald-950 hover:bg-emerald-50 transition-colors interactive-press"
                  >
                    <div className="flex flex-col items-start text-left">
                      <span className="text-[10px] text-emerald-600 font-black uppercase tracking-wider mb-1">
                        WHATSAPP
                      </span>
                      <span className="text-lg font-black leading-none italic">Expert Chat</span>
                    </div>
                  </Button>
                </a>
              )}
            </div>
          </div>

          <div className="flex flex-col items-center gap-10 w-full animate-fade-in">
            <div className="flex items-center gap-3 px-6 py-2.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm font-black shadow-sm">
              <CheckCircle2 className="h-4 w-4" />
              {t('digitalCardSticky')}
            </div>

            {/* Visual Asset (Digital ID Card) */}
            <div className="w-full max-w-md animate-slide-up transform hover:scale-[1.02] transition-transform duration-700">
              <DigitalIDCard />
            </div>
          </div>
        </div>

        {/* Trust Ecosystem */}
        <div
          className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl animate-slide-up"
          style={{ animationDelay: '0.2s' }}
        >
          {/* Trust Pill 1: Users */}
          <div className="glass-card rounded-[2rem] p-6 flex items-center gap-5 hover-lift">
            <div className="h-14 w-14 rounded-2xl brand-gradient flex items-center justify-center shadow-lg shadow-primary/20">
              <Users className="h-7 w-7 text-white" />
            </div>
            <div className="text-left">
              <div className="text-xl font-black text-slate-900 tracking-tight">
                {t('activeMembersValue')}
              </div>
              <div className="text-xs font-bold text-slate-900 uppercase tracking-widest leading-none mt-1">
                {t('activeMembersLabel')}
              </div>
            </div>
          </div>

          {/* Trust Pill 2: Guarantee */}
          <div className="glass-card rounded-[2rem] p-6 flex items-center gap-5 hover-lift">
            <div className="h-14 w-14 rounded-2xl accent-gradient flex items-center justify-center shadow-lg shadow-accent/20">
              <ShieldCheck className="h-7 w-7 text-white" />
            </div>
            <div className="text-left">
              <div className="text-xl font-black text-slate-900 tracking-tight">
                {t('legalProtectionValue')}
              </div>
              <div className="text-xs font-bold text-slate-900 uppercase tracking-widest leading-none mt-1">
                {t('legalProtectionLabel')}
              </div>
            </div>
          </div>

          {/* Trust Pill 3: Support */}
          <div className="glass-card rounded-[2rem] p-6 flex items-center gap-5 hover-lift">
            <div className="h-14 w-14 rounded-2xl brand-gradient-light border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/5">
              <Clock className="h-7 w-7 text-primary" />
            </div>
            <div className="text-left">
              <div className="text-xl font-black text-slate-900 tracking-tight">
                {t('caseOpeningValue')}
              </div>
              <div className="text-xs font-bold text-slate-900 uppercase tracking-widest leading-none mt-1">
                {t('caseOpeningLabel')}
              </div>
            </div>
          </div>
        </div>

        {/* Featured Logos/Text */}
        <div
          className="mt-16 flex flex-wrap justify-center gap-8 items-center animate-fade-in"
          style={{ animationDelay: '0.4s' }}
        >
          <span className="flex items-center gap-2 font-bold text-slate-900 tracking-tighter italic">
            <Shield className="h-5 w-5" />
            {t('trustBadgeSecurity')}
          </span>
          <span className="flex items-center gap-2 font-bold text-slate-900 tracking-tighter italic">
            <Star className="h-5 w-5" />
            {t('trustBadgeSupport')}
          </span>
          <span className="flex items-center gap-2 font-bold text-slate-900 tracking-tighter italic">
            <CheckCircle2 className="h-5 w-5" />
            {t('trustBadgeService')}
          </span>
        </div>
      </div>

      {/* Background Decorative Blur */}
      <div className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 translate-x-1/4 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[100px] pointer-events-none" />
    </section>
  );
}
