'use client';

import {
  BriefcaseBusiness,
  Files,
  Home,
  LifeBuoy,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { usePathname } from 'next/navigation';

import type { DashboardTranslator } from './types';

export function MobileBottomNav({ locale, t }: { locale: string; t: DashboardTranslator }) {
  const pathname = usePathname();
  const memberHomeHref = `/${locale}/member`;
  const currentPath = normalizePath(pathname ?? memberHomeHref);
  const items = [
    { href: memberHomeHref, icon: Home, label: t('bottomNav.home') },
    { href: `/${locale}/member/claims`, icon: BriefcaseBusiness, label: t('bottomNav.cases') },
    { href: `/${locale}/member/help`, icon: LifeBuoy, label: t('bottomNav.help') },
    { href: `/${locale}/member/documents`, icon: Files, label: t('bottomNav.documents') },
    { href: `/${locale}/member/membership`, icon: MoreHorizontal, label: t('bottomNav.more') },
  ];

  return (
    <nav
      aria-label={t('bottomNav.label')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1 shadow-[0_-8px_30px_rgba(0,0,0,0.04)] md:hidden"
      data-testid="mobile-bottom-nav"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {items.map((item, index) => (
          <MobileNavItem
            key={item.href}
            href={item.href}
            icon={item.icon}
            isActive={isActiveNavItem({
              currentPath,
              href: item.href,
              memberHomeHref,
            })}
            isPrimary={index === 2}
            label={item.label}
          />
        ))}
      </div>
    </nav>
  );
}

function normalizePath(pathname: string) {
  let end = pathname.length;
  while (end > 1 && pathname[end - 1] === '/') {
    end -= 1;
  }

  return pathname.slice(0, end) || '/';
}

function isActiveNavItem({
  currentPath,
  href,
  memberHomeHref,
}: {
  currentPath: string;
  href: string;
  memberHomeHref: string;
}) {
  const normalizedHref = normalizePath(href);
  if (normalizedHref === memberHomeHref) {
    return currentPath === memberHomeHref;
  }

  return currentPath === normalizedHref || currentPath.startsWith(`${normalizedHref}/`);
}

function MobileNavItem({
  href,
  icon: Icon,
  isActive,
  isPrimary = false,
  label,
}: {
  href: string;
  icon: LucideIcon;
  isActive: boolean;
  isPrimary?: boolean;
  label: string;
}) {
  if (isPrimary) {
    return (
      <a
        href={href}
        aria-current={isActive ? 'page' : undefined}
        className="relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[0.65rem] font-bold leading-none text-emerald-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 focus-visible:ring-offset-2 min-[380px]:min-h-14 min-[380px]:px-1"
      >
        <span className="absolute -top-6 inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-800 text-white shadow-[0_8px_16px_rgba(4,120,87,0.3)] ring-[5px] ring-white transition-transform active:scale-95 min-[380px]:-top-7 min-[380px]:h-14 min-[380px]:w-14">
          <Icon className="h-6 w-6 min-[380px]:h-7 min-[380px]:w-7" aria-hidden="true" />
        </span>
        <span className="mt-8 block max-w-full truncate min-[380px]:mt-9">{label}</span>
      </a>
    );
  }

  return (
    <a
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={`flex min-h-12 flex-col items-center justify-center gap-1.5 rounded-2xl px-1 text-[0.62rem] font-medium leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 focus-visible:ring-offset-2 min-[380px]:min-h-14 min-[380px]:text-[0.65rem] ${
        isActive
          ? 'text-emerald-800 font-bold'
          : 'text-slate-500 hover:text-emerald-700 hover:bg-slate-50'
      }`}
    >
      <Icon className="h-5 w-5 min-[380px]:h-6 min-[380px]:w-6" aria-hidden="true" />
      <span className="block max-w-full truncate">{label}</span>
    </a>
  );
}
