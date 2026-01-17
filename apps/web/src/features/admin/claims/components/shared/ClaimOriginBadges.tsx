import { cn } from '@/lib/utils';
import { Building2, Globe, ShieldCheck, User, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ClaimOriginType } from '../../types';

interface ClaimOriginBadgesProps {
  originType: ClaimOriginType;
  originDisplayName: string | null;
  branchCode: string | null;
  className?: string;
  variant?: 'list' | 'detail';
}

export function ClaimOriginBadges({
  originType,
  originDisplayName,
  branchCode,
  className,
  variant: _variant = 'list',
}: ClaimOriginBadgesProps) {
  const t = useTranslations('admin.claims_page.source');

  // 1. Visual Config: Icons & Colors
  const config = {
    portal: {
      icon: Globe,
      style: 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100',
      separator: 'bg-slate-200',
    },
    agent: {
      icon: User,
      style: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
      separator: 'bg-indigo-200',
    },
    admin: {
      icon: ShieldCheck,
      style: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
      separator: 'bg-amber-200',
    },
    api: {
      icon: Zap,
      style: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
      separator: 'bg-emerald-200',
    },
  }[originType];

  const Icon = config.icon;

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border shadow-sm transition-all select-none bg-white', // Added bg-white & shadow-sm for pop
        config.style,
        className
      )}
    >
      {/* Origin Segment: Icon + Label (Label hidden on mobile list view for density?) -> No, keep for clarity but tight */}
      <div className="flex items-center gap-1 px-1.5 py-0.5">
        <Icon className="w-3 h-3" strokeWidth={2.5} />
        <span className="text-[10px] uppercase tracking-wider font-bold">
          {t(`origin.${originType}`)}
        </span>
      </div>

      {/* Branch Segment */}
      {branchCode && (
        <>
          <div className={cn('w-[1px] h-3 self-center', config.separator)} />
          <div className="flex items-center gap-1 px-1.5 py-0.5">
            <Building2 className="w-3 h-3 opacity-50" />
            <span className="text-[10px] font-mono font-medium">{branchCode}</span>
          </div>
        </>
      )}

      {/* Agent Segment (if origin=agent) */}
      {originType === 'agent' && originDisplayName && (
        <>
          <div className={cn('w-[1px] h-3 self-center', config.separator)} />
          <span
            className="px-1.5 py-0.5 text-[10px] font-medium max-w-[120px] truncate"
            title={originDisplayName}
          >
            {originDisplayName}
          </span>
        </>
      )}
    </div>
  );
}
