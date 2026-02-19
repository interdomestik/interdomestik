'use client';

import { Link } from '@/i18n/routing';
import { cn } from '@interdomestik/ui/lib/utils';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
interface NavItemProps {
  href: string;
  title: string;
  icon: LucideIcon;
  badge?: string | number;
  isActive?: boolean;
  className?: string;
  onClick?: () => void;
}

export function NavItem({
  href,
  title,
  icon: Icon,
  badge,
  isActive,
  className,
  onClick,
}: NavItemProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        isActive
          ? 'text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
        className
      )}
    >
      {/* Active Background Animation */}
      {isActive && (
        <motion.div
          layoutId="active-nav-item"
          className="absolute inset-0 rounded-xl bg-primary shadow-lg shadow-primary/25"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}

      {/* Content (Relative to sit on top of background) */}
      <span
        className={cn(
          'relative z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition',
          isActive ? 'bg-white/18' : 'bg-slate-100 group-hover:bg-slate-200'
        )}
      >
        <Icon
          className={cn(
            'size-[17px] shrink-0 transition-transform duration-300',
            isActive
              ? 'scale-105 text-white'
              : 'text-slate-500 group-hover:scale-105 group-hover:text-slate-700'
          )}
        />
      </span>

      <span className="relative z-10 truncate">{title}</span>

      {badge && (
        <span
          className={cn(
            'relative z-10 ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold',
            isActive
              ? 'bg-primary-foreground/20 text-primary-foreground'
              : 'bg-primary/10 text-primary'
          )}
        >
          {badge}
        </span>
      )}

      {/* Active Dot indicator for collapsed/subtle mode if needed */}
      {isActive && (
        <div className="absolute right-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-white/40 animate-pulse md:hidden" />
      )}
    </Link>
  );
}
