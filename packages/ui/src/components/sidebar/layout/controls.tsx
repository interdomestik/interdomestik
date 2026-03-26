'use client';

import { PanelLeft } from 'lucide-react';
import * as React from 'react';
import { cn } from '../../../lib/utils';
import { Button } from '../../button';
import { useSidebar } from '../context';

const SidebarTrigger = React.forwardRef<
  React.ComponentRef<typeof Button>,
  React.ComponentProps<typeof Button>
>(({ className, onClick, title = 'Toggle Sidebar', 'aria-label': ariaLabel, ...props }, ref) => {
  const { toggleSidebar } = useSidebar();
  const label = ariaLabel ?? title;

  return (
    <Button
      ref={ref}
      data-sidebar="trigger"
      variant="ghost"
      size="icon"
      className={cn('h-7 w-7', className)}
      onClick={event => {
        onClick?.(event);
        toggleSidebar();
      }}
      aria-label={label}
      title={title}
      {...props}
    >
      <PanelLeft />
      <span className="sr-only">{label}</span>
    </Button>
  );
});
SidebarTrigger.displayName = 'SidebarTrigger';

const SidebarRail = React.forwardRef<HTMLButtonElement, React.ComponentProps<'button'>>(
  ({ className, title = 'Toggle Sidebar', 'aria-label': ariaLabel, ...props }, ref) => {
    const { toggleSidebar } = useSidebar();
    const label = ariaLabel ?? title;

    return (
      <button
        ref={ref}
        data-sidebar="rail"
        aria-label={label}
        tabIndex={-1}
        onClick={toggleSidebar}
        title={title}
        className={cn(
          'absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-sidebar-border group-data-[side=left]:-right-4 group-data-[side=right]:left-0 sm:flex',
          '[[data-side=left]_&]:cursor-w-resize [[data-side=right]_&]:cursor-e-resize',
          '[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize',
          'group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full group-data-[collapsible=offcanvas]:hover:bg-sidebar',
          '[[data-side=left][data-collapsible=offcanvas]_&]:-right-2',
          '[[data-side=right][data-collapsible=offcanvas]_&]:-left-2',
          className
        )}
        {...props}
      />
    );
  }
);
SidebarRail.displayName = 'SidebarRail';

export { SidebarRail, SidebarTrigger };
