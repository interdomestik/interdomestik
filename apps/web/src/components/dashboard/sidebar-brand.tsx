import { Link } from '@/i18n/routing';
import { SidebarHeader } from '@interdomestik/ui';
import { Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface SidebarBrandProps {
  role?: string;
}

export function SidebarBrand({ role }: SidebarBrandProps) {
  const t = useTranslations('nav');
  // V3 Unified Hub: Both Members and Agents start at /member (Crystal Hub)
  const homeHref =
    role === 'admin' || role === 'super_admin' || role === 'tenant_admin'
      ? '/admin'
      : role === 'agent'
        ? '/agent'
        : '/member';

  return (
    <SidebarHeader className="m-2 h-20 rounded-2xl border border-white/70 bg-white/80 shadow-[0_20px_38px_-34px_rgba(15,23,42,0.8)] backdrop-blur-xl">
      <Link
        href={homeHref}
        className="group flex w-full items-center gap-3 px-3 font-bold text-xl transition-opacity hover:opacity-90 group-data-[state=collapsed]:justify-center"
      >
        <div className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-[0_14px_24px_-16px_rgba(37,99,235,0.95)] transition-transform group-hover:scale-105">
          <Shield className="h-5 w-5" />
        </div>
        <div className="animate-in fade-in flex flex-col duration-300 group-data-[state=collapsed]:hidden">
          <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text leading-none tracking-tight text-transparent">
            Interdomestik
          </span>
          <span className="mt-1 inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
            {role === 'agent' ? t('agentPortal') : t('memberPortal')}
          </span>
        </div>
      </Link>
    </SidebarHeader>
  );
}
