'use client';

import { Link } from '@/i18n/routing';
import { motion } from 'framer-motion';
import { AlertCircle, ClipboardList, CreditCard, Star, type LucideIcon } from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  incident: AlertCircle,
  report: ClipboardList,
  'green-card': CreditCard,
  benefits: Star,
};

interface MatteAnchorCardProps {
  label: string;
  description: string;
  iconName: string;
  href: string;
  colorClassName?: string;
}

export function MatteAnchorCard({
  label,
  description,
  iconName,
  href,
  colorClassName = 'from-slate-900 to-slate-800',
}: MatteAnchorCardProps) {
  const Icon = ICON_MAP[iconName] || AlertCircle;

  return (
    <motion.div
      whileHover={{ y: -8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="group relative h-full"
    >
      <Link href={href} className="block h-full">
        <div
          className={`
          relative h-full p-8 rounded-[2.5rem] bg-gradient-to-br ${colorClassName}
          border border-white/10 overflow-hidden transition-all duration-500
          shadow-[0_10px_15px_-3px_rgba(0,0,0,0.4),0_20px_25px_-5px_rgba(0,0,0,0.1)]
          group-hover:shadow-[0_40px_60px_-15px_rgba(0,0,0,0.5),0_10px_15px_-3px_rgba(0,0,0,0.4)]
        `}
        >
          <div className="bg-white/10 p-4 rounded-2xl w-fit mb-6">
            <Icon className="w-7 h-7 text-white" />
          </div>
          <div className="mt-auto">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60 mb-1">
              {description}
            </p>
            <span className="text-2xl font-black text-white leading-tight block">{label}</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
