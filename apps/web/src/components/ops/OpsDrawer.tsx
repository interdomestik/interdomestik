'use client';

import { Button, Sheet, SheetContent, SheetHeader, SheetTitle } from '@interdomestik/ui';
import { useIsMobile } from '@interdomestik/ui/hooks/use-mobile';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  canRestoreMobileSheetFocus,
  recordMobileSheetOpener,
  type PendingSheetOpener,
} from '@/components/shell/mobile-sheet-focus';
import { OPS_TEST_IDS } from './testids';

interface OpsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
  testId?: string;
  closeLabel?: string;
  descriptionText?: string;
  inlineOnMobile?: boolean;
  selectionKey?: string;
}

export function OpsDrawer({
  open,
  onOpenChange,
  title,
  children,
  footer,
  contentClassName,
  testId,
  closeLabel,
  descriptionText,
  inlineOnMobile = false,
  selectionKey,
}: Readonly<OpsDrawerProps>) {
  const isMobile = useIsMobile();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  // An open drawer keeps its presentation, so crossing the breakpoint cannot remount the
  // children and drop unsent drafts; the choice is made once the viewport is known.
  const [lockedInline, setLockedInline] = useState<boolean | null>(null);
  if (!open || !hydrated) {
    if (lockedInline !== null) setLockedInline(null);
  } else if (lockedInline === null) {
    setLockedInline(inlineOnMobile && isMobile);
  }
  const inline = lockedInline ?? (inlineOnMobile && isMobile);
  const opener = useRef<HTMLElement | null>(null);
  const pendingOpener = useRef<PendingSheetOpener | null>(null);
  const panel = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!inline || !open) return;
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && !panel.current?.contains(activeElement)) {
      recordMobileSheetOpener(pendingOpener, activeElement, true);
    }
    opener.current = pendingOpener.current?.element ?? null;
    pendingOpener.current = null;
    panel.current?.focus();
  }, [inline, open, selectionKey]);

  // Selection changes capture a new opener without restoring the previous selection's focus.
  useEffect(() => {
    if (!inline || !open) return;
    return () => {
      if (canRestoreMobileSheetFocus(opener.current)) opener.current.focus();
      opener.current = null;
    };
  }, [inline, open]);

  // Bubble-phase document listener: nested React handlers can claim Escape first.
  useEffect(() => {
    if (!inline || !open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (target instanceof Node && panel.current?.contains(target)) onOpenChange(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [inline, open, onOpenChange]);

  if (inline) {
    if (!open) return null;
    return (
      <section
        ref={panel}
        tabIndex={-1}
        aria-label={title}
        data-testid={testId ?? OPS_TEST_IDS.DRAWER}
        className="min-w-0 scroll-mt-40 space-y-4 rounded-lg border bg-background p-3 [overflow-wrap:anywhere]"
      >
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h2 className="min-w-0 text-lg font-semibold">{title}</h2>
          <Button
            variant="outline"
            className="h-auto min-h-11 max-w-full whitespace-normal"
            data-testid="ops-drawer-close"
            onClick={() => onOpenChange(false)}
          >
            {closeLabel}
          </Button>
        </div>
        {children}
        {footer}
      </section>
    );
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={
          contentClassName ??
          'w-full max-w-full sm:max-w-md md:max-w-lg flex min-w-0 flex-col h-dvh [overflow-wrap:anywhere] [&>button]:size-11'
        }
        data-testid={testId ?? OPS_TEST_IDS.DRAWER}
        closeLabel={closeLabel}
        descriptionText={descriptionText}
        titleText={title}
        onOpenAutoFocus={() => {
          opener.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={event => {
          const target = opener.current;
          opener.current = null;
          if (!canRestoreMobileSheetFocus(target)) return;
          target.focus();
          if (document.activeElement === target) event.preventDefault();
        }}
      >
        <SheetHeader className="min-w-0 pr-10">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto py-4 space-y-6">{children}</div>
        {footer}
      </SheetContent>
    </Sheet>
  );
}
