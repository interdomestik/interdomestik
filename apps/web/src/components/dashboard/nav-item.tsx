'use client';

import { Link } from '@/i18n/routing';
import { cn } from '@interdomestik/ui/lib/utils';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { usePathname } from 'next/navigation'; // Use standard hook for matching

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
  // If isActive is not provided, derive it (optional)
  // But usually passed from parent for precise control

  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
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
      <Icon
        className={cn(
          'relative z-10 size-5 shrink-0 transition-transform duration-300',
          isActive ? 'scale-110' : 'group-hover:scale-110'
        )}
      />

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
