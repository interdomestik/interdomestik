'use client';

import { updateUserAgent } from '@/actions/admin-users';
import { Link, useRouter } from '@/i18n/routing';
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

  const withUsersListContext = (href: string) => {
    const listQueryString = searchParams.toString();
    if (!listQueryString) return href;

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
      if ('error' in result) {
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
        <TableRow>
          <TableHead>{t('headers.user')}</TableHead>
          <TableHead>{t('headers.role')}</TableHead>
          <TableHead>{t('headers.assigned_agent')}</TableHead>
          <TableHead>{t('headers.joined')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map(user => (
          <TableRow
            key={user.id}
            className={user.unreadCount ? 'bg-amber-50/40 hover:bg-amber-50/60' : undefined}
          >
            <TableCell>
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src={user.image || ''} />
                  <AvatarFallback>{user.name?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="font-medium">{user.name}</span>
                  <span className="text-xs text-muted-foreground">{user.email}</span>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                      <Link href={withUsersListContext(`/admin/users/${user.id}`)}>
                        {t('view_profile')}
                      </Link>
                    </Button>
                    {!!user.unreadCount && user.alertLink && (
                      <Button
                        asChild
                        size="sm"
                        className="h-7 gap-2 px-3 text-xs font-semibold shadow-sm animate-pulse bg-amber-500 text-white hover:bg-amber-600"
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
              <Badge variant="outline">{tCommon(`roles.${user.role}`)}</Badge>
            </TableCell>
            <TableCell>
              {isMember(user.role) ? (
                <Select
                  disabled={loadingId === user.id}
                  value={assignedAgents[user.id] || 'unassigned'}
                  onValueChange={val => handleAgentChange(user.id, val)}
                >
                  <SelectTrigger className="w-[180px]">
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
            <TableCell className="text-sm">
              {new Date(user.createdAt).toLocaleDateString()}
            </TableCell>
          </TableRow>
        ))}
        {showEmptyState && users.length === 0 && (
          <TableRow>
            <TableCell colSpan={4} className="h-24 text-center">
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

  return <div className="rounded-md border bg-white">{tableContent}</div>;
}
