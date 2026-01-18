'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@interdomestik/ui';
import type { ReactNode } from 'react';

interface OpsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
  testId?: string;
}

export function OpsDrawer({
  open,
  onOpenChange,
  title,
  children,
  footer,
  contentClassName,
  testId,
}: OpsDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={contentClassName ?? 'sm:max-w-md md:max-w-lg flex flex-col h-full'}
        data-testid={testId ?? 'ops-drawer'}
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto py-4 space-y-6">{children}</div>
        {footer}
      </SheetContent>
    </Sheet>
  );
}
