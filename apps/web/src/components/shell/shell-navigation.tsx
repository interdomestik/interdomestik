'use client';

import { Link } from '@/i18n/routing';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@interdomestik/ui';
import type { LucideIcon } from 'lucide-react';

export type ShellNavigationItem = Readonly<{
  href: string;
  title: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Query-sensitive selection remains owned by the existing consumer. */
  selected?: boolean;
}>;

type NavigationGroup = Readonly<{
  id: string;
  label?: string;
  items: readonly ShellNavigationItem[];
}>;

const routePath = (href: string) => href.split(/[?#]/)[0];

/** Presentation of admitted items only; this component makes no access decisions. */
export function ShellNavigation({
  label,
  groups,
  pathname,
}: Readonly<{ label: string; groups: readonly NavigationGroup[]; pathname: string }>) {
  const { isMobile, setOpenMobile } = useSidebar();
  const seen = new Set<string>();
  const uniqueGroups = groups.map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (seen.has(item.href)) return false;
      seen.add(item.href);
      return true;
    }),
  }));
  const active = uniqueGroups
    .flatMap(group => group.items)
    .filter(item => {
      if (item.selected !== undefined) return item.selected;
      const path = routePath(item.href);
      return pathname === path || (!item.exact && pathname.startsWith(`${path}/`));
    })
    .sort((a, b) => routePath(b.href).length - routePath(a.href).length)[0];

  return (
    <nav aria-label={label} data-testid="shell-navigation">
      {uniqueGroups.map(group =>
        group.items.length ? (
          <SidebarGroup key={group.id} className="group-data-[state=collapsed]:px-1">
            {group.label && (
              <SidebarGroupLabel>
                <span className="truncate">{group.label}</span>
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-1.5">
                {group.items.map(item => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active === item}
                      tooltip={item.title}
                      className="min-h-11 rounded-xl px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:bg-primary data-[active=true]:text-primary-foreground [&>svg]:text-current"
                    >
                      <Link
                        href={item.href}
                        aria-current={active === item ? 'page' : undefined}
                        onClick={event => {
                          if (
                            isMobile &&
                            !event.defaultPrevented &&
                            event.button === 0 &&
                            !event.metaKey &&
                            !event.ctrlKey &&
                            !event.shiftKey &&
                            !event.altKey
                          )
                            setOpenMobile(false);
                        }}
                      >
                        <item.icon aria-hidden="true" className="size-4 shrink-0" />
                        <span className="truncate group-data-[state=collapsed]:sr-only">
                          {item.title}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null
      )}
    </nav>
  );
}
