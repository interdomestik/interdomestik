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
    <SidebarHeader className="h-20 flex items-center justify-center border-b border-white/10">
      <Link
        href={homeHref}
        className="flex items-center gap-3 font-bold text-xl px-2 w-full group-data-[state=collapsed]:justify-center group hover:opacity-90 transition-opacity"
      >
        <div className="h-10 w-10 rounded-xl brand-gradient flex items-center justify-center text-white shadow-lg shadow-primary/25 transition-transform group-hover:scale-105 shrink-0">
          <Shield className="h-6 w-6" />
        </div>
        <div className="flex flex-col group-data-[state=collapsed]:hidden animate-in fade-in duration-300">
          <span className="leading-none bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 tracking-tight">
            Interdomestik
          </span>
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-1">
            {role === 'agent' ? t('agentPortal') : t('memberPortal')}
          </span>
        </div>
      </Link>
    </SidebarHeader>
  );
}
