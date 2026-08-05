'use client';

import { Link } from '@/i18n/routing';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

const publicLocales = ['sq', 'en', 'sr', 'mk'] as const;

export function Header() {
  const locale = useLocale();
  const t = useTranslations('nav');
  const [localeOpen, setLocaleOpen] = useState(false);
  const localeTrigger = useRef<HTMLButtonElement>(null);

  return (
    <header
      role="banner"
      className="sticky top-0 z-50 border-b border-white/10 bg-[#001A33] text-white"
    >
      <div className="mx-auto flex min-h-[4.75rem] w-full max-w-[90rem] flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2 py-1 sm:flex-nowrap sm:gap-y-0 sm:px-6 sm:py-0 lg:px-10 xl:px-14">
        <Link
          href="/"
          aria-label="Interdomestik"
          className="group inline-flex min-h-11 min-w-11 shrink-0 items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DE0D7] focus-visible:ring-offset-2 focus-visible:ring-offset-[#001A33] sm:gap-3"
        >
          <ShieldCheck
            aria-hidden="true"
            className="h-6 w-6 text-[#5DE0D7] sm:h-8 sm:w-8"
            strokeWidth={1.6}
          />
          <span className="font-display text-xs font-semibold sm:text-2xl sm:tracking-[-0.02em]">
            Interdomestik
          </span>
        </Link>

        <div className="ml-auto flex max-w-full items-center gap-1 sm:gap-4">
          <div
            className="relative"
            onKeyDown={event => {
              if (event.key !== 'Escape' || !localeOpen) return;
              event.preventDefault();
              event.stopPropagation();
              setLocaleOpen(false);
              localeTrigger.current?.focus();
            }}
          >
            <button
              ref={localeTrigger}
              type="button"
              data-testid="public-locale-trigger"
              aria-expanded={localeOpen}
              aria-controls="public-locale-options"
              aria-label={t('language')}
              onClick={() => setLocaleOpen(open => !open)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-sm px-1 text-xs font-semibold uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DE0D7] sm:min-w-14 sm:px-3 sm:text-sm"
            >
              {locale}
              <ChevronDown aria-hidden="true" className="h-4 w-4" />
            </button>
            {localeOpen ? (
              <div
                id="public-locale-options"
                className="absolute -right-1 top-full mt-2 grid min-w-28 border border-slate-200 bg-white p-1 text-[#001A33] shadow-xl sm:right-0 sm:min-w-32"
              >
                {publicLocales.map(option => (
                  <Link
                    key={option}
                    href="/"
                    locale={option}
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
            className="inline-flex min-h-11 min-w-11 items-center justify-center border border-white/70 px-1 text-xs font-semibold transition-colors hover:bg-white hover:text-[#001A33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DE0D7] motion-reduce:transition-none sm:px-6 sm:text-sm"
          >
            {t('login')}
          </Link>
        </div>
      </div>
    </header>
  );
}
