'use client';

import { Link } from '@/i18n/routing';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

const publicLocales = ['sq', 'en', 'sr', 'mk'] as const;

export function Header() {
  const locale = useLocale();
  const t = useTranslations('nav');
  const [localeOpen, setLocaleOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#001A33] text-white">
      <div className="mx-auto flex min-h-[4.75rem] w-full max-w-[90rem] items-center justify-between px-4 sm:px-6 lg:px-10 xl:px-14">
        <Link
          href="/"
          aria-label="Interdomestik"
          className="group inline-flex min-h-11 items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DE0D7] focus-visible:ring-offset-2 focus-visible:ring-offset-[#001A33]"
        >
          <ShieldCheck aria-hidden="true" className="h-8 w-8 text-[#5DE0D7]" strokeWidth={1.6} />
          <span className="font-display text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
            Interdomestik
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="relative">
            <button
              type="button"
              aria-expanded={localeOpen}
              aria-haspopup="menu"
              aria-label={t('language')}
              onClick={() => setLocaleOpen(open => !open)}
              className="inline-flex min-h-11 min-w-14 items-center justify-center gap-1 rounded-sm px-3 text-sm font-semibold uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DE0D7]"
            >
              {locale}
              <ChevronDown aria-hidden="true" className="h-4 w-4" />
            </button>
            {localeOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full mt-2 grid min-w-32 overflow-hidden border border-slate-200 bg-white p-1 text-[#001A33] shadow-xl"
              >
                {publicLocales.map(option => (
                  <Link
                    key={option}
                    href="/"
                    locale={option}
                    role="menuitem"
                    data-testid="public-locale-option"
                    onClick={() => setLocaleOpen(false)}
                    className="flex min-h-11 items-center px-4 text-sm font-semibold uppercase hover:bg-[#E8F7F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#006A70]"
                  >
                    {option}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center justify-center border border-white/70 px-4 text-sm font-semibold transition-colors hover:bg-white hover:text-[#001A33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DE0D7] motion-reduce:transition-none sm:px-6"
          >
            {t('login')}
          </Link>
        </div>
      </div>
    </header>
  );
}
