import { Link } from '@/i18n/routing';
import { contactInfo } from '@/lib/contact';
import { Button } from '@interdomestik/ui';
import {
  ArrowRight,
  CheckCircle2,
  MessageCircle,
  Phone,
  Shield,
  ShieldCheck,
  Star,
  Users,
  Zap,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

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

      <div className="container mx-auto px-4 relative z-10 py-12 lg:py-24">
        <div className="flex flex-col items-center text-center">
          {/* Prime Statement Badge */}
          <div className="inline-flex items-center gap-3 px-6 py-2 rounded-2xl brand-gradient text-white text-base font-black mb-10 overflow-hidden shadow-2xl shadow-primary/40 ring-4 ring-primary/10 animate-fade-in group cursor-default hover:scale-105 transition-all">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
            </div>
            <span className="tracking-widest uppercase">{t('badge')}</span>
            <div className="h-4 w-px bg-white/30 mx-1" />
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-black/20 backdrop-blur-sm">
              <Star className="h-4 w-4 fill-amber-300 text-amber-300" />
              <span className="text-sm">4.9</span>
            </div>
          </div>

          {/* Main Headline */}
          <div className="max-w-4xl mb-8 animate-fade-in">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-black text-slate-900 tracking-tighter leading-[0.9] mb-6">
              {t('title').split(' ').slice(0, -1).join(' ')}{' '}
              <span className="block mt-2 text-5xl md:text-7xl lg:text-8xl bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent transform -rotate-1 origin-left leading-none tracking-[-0.05em]">
                {t('title').split(' ').pop()}
              </span>
            </h1>
            <p className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto font-medium leading-tight opacity-80">
              {t('subtitle')}
            </p>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-5 items-center justify-center mb-16 animate-slide-up">
            <Link href="/register">
              <Button
                size="xl"
                className="h-16 px-10 text-lg font-bold rounded-2xl shadow-2xl shadow-primary/30 cta-press group overflow-hidden relative"
              >
                <div className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-[3000ms] bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
                <Zap className="mr-2 h-5 w-5 fill-current" />
                {t('cta')}
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>

            <div className="flex gap-4">
              {telHref && (
                <a href={telHref}>
                  <Button
                    variant="outline"
                    size="xl"
                    className="h-16 px-6 glass rounded-2xl border-slate-200 text-slate-700 hover:bg-slate-50 interactive-press"
                  >
                    <Phone className="mr-2 h-5 w-5 text-primary" />
                    {t('callNow')}
                  </Button>
                </a>
              )}
              {whatsapp && (
                <a href={whatsapp}>
                  <Button
                    variant="outline"
                    size="xl"
                    className="h-16 px-6 bg-emerald-50 rounded-2xl border-emerald-100 text-emerald-700 hover:bg-emerald-100/80 interactive-press"
                  >
                    <MessageCircle className="mr-2 h-5 w-5 fill-emerald-500/10" />
                    WhatsApp
                  </Button>
                </a>
              )}
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
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none mt-1">
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
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none mt-1">
                  {t('legalProtectionLabel')}
                </div>
              </div>
            </div>

            {/* Trust Pill 3: Support */}
            <div className="glass-card rounded-[2rem] p-6 flex items-center gap-5 hover-lift">
              <div className="h-14 w-14 rounded-2xl brand-gradient-light border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/5">
                <Zap className="h-7 w-7 text-primary" />
              </div>
              <div className="text-left">
                <div className="text-xl font-black text-slate-900 tracking-tight">
                  {t('caseOpeningValue')}
                </div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none mt-1">
                  {t('caseOpeningLabel')}
                </div>
              </div>
            </div>
          </div>

          {/* Featured Logos/Text */}
          <div
            className="mt-16 flex flex-wrap justify-center gap-8 opacity-40 grayscale animate-fade-in"
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
      </div>

      {/* Background Decorative Blur */}
      <div className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 translate-x-1/4 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[100px] pointer-events-none" />
    </section>
  );
}
