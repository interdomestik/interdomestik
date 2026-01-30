import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface HomeGridProps {
  children: ReactNode;
  className?: string;
}

export function HomeGrid({ children, className }: HomeGridProps) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-6', className)}>
      {children}
    </div>
  );
}
