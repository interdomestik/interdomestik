'use client';

import { updateUserAgent } from '@/actions/admin-users';
import { GlassCard } from '@/components/ui/glass-card';
import { Link, useRouter } from '@/i18n/routing';
import { getRoleLabel } from '@/lib/roles-i18n';
import { isMember } from '@/lib/roles';
import { Avatar, AvatarFallback, AvatarImage } from '@interdomestik/ui/components/avatar';
import { Badge } from '@interdomestik/ui/components/badge';
import { Button } from '@interdomestik/ui/components/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@interdomestik/ui/components/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@interdomestik/ui/components/table';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface User {
  id: string;
  name: string | null;
  email: string;
  role: string;
  image: string | null;
  agentId: string | null;
  agent?: {
    id: string;
    name: string | null;
  } | null;
  createdAt: Date;
  unreadCount?: number;
  unreadClaimId?: string | null;
  alertLink?: string | null;
  memberNumber?: string | null;
}

interface Agent {
  id: string;
  name: string | null;
}

interface UsersTableProps {
  readonly users: User[];
  readonly agents: Agent[];
  readonly showEmptyState?: boolean;
  readonly showContainer?: boolean;
}

export function UsersTable({
  users,
  agents,
  showEmptyState = true,
  showContainer = true,
}: UsersTableProps) {
  const t = useTranslations('admin.users_table');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantIdFromQuery = searchParams.get('tenantId');

  const tenantIdFromCookie = () => {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/(?:^|;\s*)tenantId=([^;]+)/);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  };

  const withUsersListContext = (href: string) => {
    const listQueryString = searchParams.toString();
    const fallbackTenantId = tenantIdFromQuery ?? tenantIdFromCookie();
    if (!listQueryString && !fallbackTenantId) return href;

    const [path, queryString] = href.split('?');

    const merged = new URLSearchParams(listQueryString);
    if (queryString) {
      const destinationParams = new URLSearchParams(queryString);
      const destinationKeys = new Set(Array.from(destinationParams.keys()));
      for (const key of destinationKeys) {
        merged.delete(key);
        for (const value of destinationParams.getAll(key)) {
          merged.append(key, value);
        }
      }
    }

    if (fallbackTenantId && !merged.get('tenantId')) {
      merged.set('tenantId', fallbackTenantId);
    }

    const next = merged.toString();
    return next ? `${path}?${next}` : path;
  };
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [assignedAgents, setAssignedAgents] = useState<Record<string, string>>({});

  useEffect(() => {
    const nextAssignments: Record<string, string> = {};
    for (const user of users) {
      nextAssignments[user.id] = user.agentId || 'unassigned';
    }
    setAssignedAgents(nextAssignments);
  }, [users]);

  const handleAgentChange = async (userId: string, agentId: string) => {
    const previousValue = assignedAgents[userId] || 'unassigned';
    setAssignedAgents(current => ({ ...current, [userId]: agentId }));
    setLoadingId(userId);
    try {
      const result = await updateUserAgent(userId, agentId === 'unassigned' ? null : agentId);
      if (!result.success) {
        setAssignedAgents(current => ({ ...current, [userId]: previousValue }));
        toast.error(result.error);
      } else {
        toast.success(t('success_message'));
        router.refresh();
      }
    } catch {
      setAssignedAgents(current => ({ ...current, [userId]: previousValue }));
      toast.error(tCommon('errors.generic'));
    } finally {
      setLoadingId(null);
    }
  };

  const tableContent = (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent border-white/10">
          <TableHead>{t('headers.user')}</TableHead>
          <TableHead>{t('headers.role')}</TableHead>
          <TableHead>Member ID</TableHead>
          <TableHead>{t('headers.assigned_agent')}</TableHead>
          <TableHead>{t('headers.joined')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map(user => (
          <TableRow
            key={user.id}
            className={`transition-colors border-white/5 ${
              user.unreadCount
                ? 'bg-amber-500/5 hover:bg-amber-500/10'
                : 'hover:bg-white/5 dark:hover:bg-white/5'
            }`}
          >
            <TableCell>
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9 border border-white/10">
                  <AvatarImage src={user.image || ''} />
                  <AvatarFallback className="bg-white/10 text-muted-foreground">
                    {user.name?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="font-medium">{user.name}</span>
                  <span className="text-xs text-muted-foreground">{user.email}</span>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button
                      asChild
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs hover:bg-blue-500/10 hover:text-blue-500 border border-white/10"
                    >
                      <Link href={withUsersListContext(`/admin/users/${user.id}`)}>
                        {t('view_profile')}
                      </Link>
                    </Button>
                    {!!user.unreadCount && user.alertLink && (
                      <Button
                        asChild
                        size="sm"
                        className="h-7 gap-2 px-3 text-xs font-semibold shadow-sm animate-pulse bg-amber-500 text-white hover:bg-amber-600 border-none"
                      >
                        <Link href={withUsersListContext(user.alertLink)}>
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                          </span>
                          {t('message_alert', { count: user.unreadCount })}
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="outline" className="border-white/10 bg-white/5 text-muted-foreground">
                {getRoleLabel(tCommon, user.role)}
              </Badge>
            </TableCell>
            <TableCell>
              {user.memberNumber ? (
                <code className="text-xs font-mono bg-white/5 px-1.5 py-0.5 rounded text-muted-foreground">
                  {user.memberNumber}
                </code>
              ) : (
                <span className="text-muted-foreground text-xs">-</span>
              )}
            </TableCell>
            <TableCell>
              {isMember(user.role) ? (
                <Select
                  disabled={loadingId === user.id}
                  value={assignedAgents[user.id] || 'unassigned'}
                  onValueChange={val => handleAgentChange(user.id, val)}
                >
                  <SelectTrigger className="w-[180px] bg-white/5 border-white/10 focus:ring-0 focus:ring-offset-0">
                    <SelectValue placeholder={t('select_agent')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">{t('unassigned')}</SelectItem>
                    {agents.map(agent => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-sm text-muted-foreground">{tCommon('none')}</span>
              )}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {new Date(user.createdAt).toLocaleDateString()}
            </TableCell>
          </TableRow>
        ))}
        {showEmptyState && users.length === 0 && (
          <TableRow>
            <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
              {t('no_users')}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  if (!showContainer) {
    return tableContent;
  }

  return <GlassCard className="overflow-hidden p-0">{tableContent}</GlassCard>;
}
