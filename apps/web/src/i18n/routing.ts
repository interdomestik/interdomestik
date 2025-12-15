import { createNavigation } from 'next-intl/navigation';
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  // List of all supported locales
  locales: ['sq', 'en', 'sr', 'mk'],

  // Used when no locale matches
  defaultLocale: 'sq',

  // Optional: Locale prefix strategy
  localePrefix: 'always',

  // Disable automatic locale detection based on Accept-Language header
  // This forces the defaultLocale (sq) when visiting /
  localeDetection: false,
});

// Lightweight wrappers around Next.js navigation APIs
// that handle locale automatically
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
