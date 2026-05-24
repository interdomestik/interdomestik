'use client';

import { Link } from '@/i18n/routing';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AlertCircle,
  ClipboardList,
  CreditCard,
  Globe,
  Share2,
  Star,
  TrendingUp,
  UserPlus,
  Zap,
  type LucideIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  incident: AlertCircle,
  report: ClipboardList,
  'green-card': CreditCard,
  benefits: Star,
  globe: Globe,
  share: Share2,
  'trending-up': TrendingUp,
  'user-plus': UserPlus,
  zap: Zap,
};

interface MatteAnchorCardProps {
  label: string;
  description: string;
  iconName: string;
  href: string;
  colorClassName?: string;
  compact?: boolean;
  testId?: string;
}

export function MatteAnchorCard({
  label,
  description,
  iconName,
  href,
  colorClassName = 'from-slate-900 to-slate-800',
  compact = false,
  testId,
}: MatteAnchorCardProps) {
  const Icon = ICON_MAP[iconName] || AlertCircle;
  const shouldReduceMotion = useReducedMotion();
  const hoverOffset = compact ? -3 : -8;

  return (
    <motion.div
      whileHover={shouldReduceMotion ? undefined : { y: hoverOffset }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="group relative h-full min-w-0"
    >
      <Link href={href} className="block h-full min-w-0" data-testid={testId}>
        <div
          className={`
          relative h-full min-w-0 bg-gradient-to-br ${colorClassName}
          border border-white/10 overflow-hidden motion-safe:transition-shadow motion-safe:duration-300
          ${
            compact
              ? 'rounded-2xl p-5 shadow-[0_8px_14px_-8px_rgba(0,0,0,0.45)] group-hover:shadow-[0_16px_24px_-14px_rgba(0,0,0,0.5)]'
              : 'rounded-[2.5rem] p-8 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.4),0_20px_25px_-5px_rgba(0,0,0,0.1)] group-hover:shadow-[0_40px_60px_-15px_rgba(0,0,0,0.5),0_10px_15px_-3px_rgba(0,0,0,0.4)]'
          }
        `}
        >
          <div className={`mb-5 w-fit rounded-2xl bg-white/10 ${compact ? 'p-3' : 'p-4'}`}>
            <Icon className={`${compact ? 'h-5 w-5' : 'h-7 w-7'} text-white`} />
          </div>
          <div className="mt-auto min-w-0">
            <p className="mb-1 break-words text-[10px] font-black uppercase tracking-[0.16em] text-white/70">
              {description}
            </p>
            <span
              className={`block break-words font-black leading-tight text-white ${compact ? 'text-lg' : 'text-2xl'}`}
            >
              {label}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
