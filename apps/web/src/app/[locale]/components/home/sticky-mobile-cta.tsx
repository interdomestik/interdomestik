'use client';

import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui';
import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export function StickyPrimeCTA() {
  const t = useTranslations('hero');
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Show after scrolling 600px
      setIsVisible(window.scrollY > 600);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!isVisible) return null;

  return (
    <>
      {/* Mobile Sticky Bar - Full Width */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-3 bg-white/80 backdrop-blur-2xl border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] md:hidden animate-slide-up">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <ShieldCheck className="h-3 w-3 text-primary shrink-0" />
              <span className="text-[9px] font-black uppercase tracking-tight text-slate-900 truncate">
                {t('digitalCardSticky')}
              </span>
            </div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-emerald-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {t('badge')}
              </span>
            </div>
          </div>
          <Link href="/register">
            <Button
              size="lg"
              className="h-12 px-6 font-black rounded-xl brand-gradient text-white shadow-lg shadow-primary/20 group relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer" />
              <span className="relative z-10 flex items-center">
                {t('cta')}
                <ArrowRight className="ml-1.5 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Desktop Sticky Pill - Floating Right */}
      <div className="fixed bottom-8 right-8 z-50 hidden md:block animate-fade-in">
        <div className="relative group">
          {/* Glowing Aura */}
          <div className="absolute -inset-1 bg-gradient-to-r from-primary via-secondary to-accent rounded-[2rem] blur opacity-20 group-hover:opacity-100 transition duration-1000 group-hover:duration-200" />

          <div className="relative flex items-center gap-4 bg-white/95 backdrop-blur-xl border border-white p-1.5 pl-5 rounded-[2rem] shadow-2xl">
            <div className="flex flex-col items-start mr-2">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Sparkles className="h-3 w-3 text-amber-400" />
                <span className="text-[9px] font-black uppercase tracking-tight text-slate-800">
                  {t('digitalCardSticky')}
                </span>
              </div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-emerald-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {t('badge')}
                </span>
              </div>
            </div>

            <Link href="/register">
              <Button
                size="lg"
                className="h-12 px-6 font-black rounded-2xl brand-gradient text-white shadow-xl shadow-primary/20 group border-0"
              >
                {t('cta')}
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
