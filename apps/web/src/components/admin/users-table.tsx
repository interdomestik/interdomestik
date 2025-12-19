'use client';

import { updateUserAgent } from '@/actions/admin-users';
import { Avatar, AvatarFallback, AvatarImage } from '@interdomestik/ui/components/avatar';
import { Badge } from '@interdomestik/ui/components/badge';
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
import { useState } from 'react';
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
}

interface Agent {
  id: string;
  name: string | null;
}

interface UsersTableProps {
  users: User[];
  agents: Agent[];
}

export function UsersTable({ users, agents }: UsersTableProps) {
  const t = useTranslations('admin.users_table');
  const tCommon = useTranslations('common');
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleAgentChange = async (userId: string, agentId: string) => {
    setLoadingId(userId);
    try {
      const result = await updateUserAgent(userId, agentId === 'unassigned' ? null : agentId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(t('success_message'));
      }
    } catch {
      toast.error(tCommon('errors.generic'));
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="rounded-md border bg-white">
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
            <TableRow key={user.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={user.image || ''} />
                    <AvatarFallback>{user.name?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-medium">{user.name}</span>
                    <span className="text-xs text-muted-foreground">{user.email}</span>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{tCommon(`roles.${user.role}`)}</Badge>
              </TableCell>
              <TableCell>
                <Select
                  disabled={loadingId === user.id || user.role === 'admin' || user.role === 'agent'}
                  defaultValue={user.agentId || 'unassigned'}
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
              </TableCell>
              <TableCell className="text-sm">
                {new Date(user.createdAt).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
          {users.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center">
                {t('no_users')}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
