'use client';

import {
  createBranch,
  grantUserRole,
  listBranches,
  listUserRoles,
  revokeUserRole,
} from '@/actions/admin-rbac';
import {
  ROLE_BRANCH_MANAGER,
  ROLE_MEMBER,
  ROLE_PROMOTER,
  ROLE_TENANT_ADMIN,
} from '@/lib/roles.core';
import { Button } from '@interdomestik/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui/components/card';
import { Input } from '@interdomestik/ui/components/input';
import { Label } from '@interdomestik/ui/components/label';
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
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

type Branch = {
  id: string;
  name: string;
  code: string | null;
};

type UserRoleRow = {
  id: string;
  role: string;
  branchId: string | null;
};

const DEFAULT_ROLE_OPTIONS = [ROLE_TENANT_ADMIN, ROLE_BRANCH_MANAGER, ROLE_MEMBER, ROLE_PROMOTER];
const TENANT_WIDE_BRANCH = '__tenant__';

function formatBranchName(b: Branch | { name: string; code?: string | null }) {
  const codeSuffix = b.code ? ` (${b.code})` : '';
  return `${b.name}${codeSuffix}`;
}

export function AdminUserRolesPanel({ userId }: { userId: string }) {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get('tenantId') ?? undefined;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [roles, setRoles] = useState<UserRoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [grantRole, setGrantRole] = useState<string>(ROLE_MEMBER);
  const [grantBranchId, setGrantBranchId] = useState<string>(TENANT_WIDE_BRANCH);
  const [customRole, setCustomRole] = useState<string>('');

  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchCode, setNewBranchCode] = useState('');

  const effectiveRoleValue = (grantRole === '__custom__' ? customRole : grantRole).trim();

  const branchOptions = useMemo(() => {
    return [{ id: TENANT_WIDE_BRANCH, name: 'Tenant-wide', code: null }, ...branches];
  }, [branches]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [branchesResult, rolesResult] = await Promise.all([
        listBranches(tenantId ? { tenantId } : undefined),
        listUserRoles(tenantId ? { tenantId, userId } : { userId }),
      ]);

      setBranches((branchesResult ?? []) as Branch[]);
      setRoles((rolesResult ?? []) as UserRoleRow[]);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load roles');
    } finally {
      setLoading(false);
    }
  }, [tenantId, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleGrant = async () => {
    if (!effectiveRoleValue) {
      toast.error('Role is required');
      return;
    }

    try {
      const result = await grantUserRole({
        tenantId,
        userId,
        role: effectiveRoleValue,
        branchId: grantBranchId === TENANT_WIDE_BRANCH ? null : grantBranchId,
      });

      if ('error' in result) {
        toast.error(result.error);
        return;
      }

      toast.success('Role granted');
      setCustomRole('');
      setGrantRole(ROLE_MEMBER);
      setGrantBranchId(TENANT_WIDE_BRANCH);
      await refresh();
    } catch (err) {
      console.error(err);
      toast.error('Failed to grant role');
    }
  };

  const handleRevoke = async (row: UserRoleRow) => {
    try {
      const result = await revokeUserRole({
        tenantId,
        userId,
        role: row.role,
        branchId: row.branchId,
      });

      if ('error' in result) {
        toast.error(result.error);
        return;
      }

      toast.success('Role revoked');
      await refresh();
    } catch (err) {
      console.error(err);
      toast.error('Failed to revoke role');
    }
  };

  const handleCreateBranch = async () => {
    const name = newBranchName.trim();
    if (!name) {
      toast.error('Branch name is required');
      return;
    }

    try {
      const result = await createBranch({
        tenantId,
        name,
        code: newBranchCode.trim() || null,
      });

      if ('error' in result) {
        toast.error(result.error);
        return;
      }

      toast.success('Branch created');
      setNewBranchName('');
      setNewBranchCode('');
      await refresh();
    } catch (err) {
      console.error(err);
      toast.error('Failed to create branch');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Roles</CardTitle>
        <CardDescription>Tenant-scoped roles for this user.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label>Role</Label>
            <Select value={grantRole} onValueChange={setGrantRole}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {DEFAULT_ROLE_OPTIONS.map(r => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
                <SelectItem value="__custom__">Custom…</SelectItem>
              </SelectContent>
            </Select>
            {grantRole === '__custom__' ? (
              <Input
                value={customRole}
                onChange={e => setCustomRole(e.target.value)}
                placeholder="role_name"
              />
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label>Branch</Label>
            <Select value={grantBranchId} onValueChange={setGrantBranchId}>
              <SelectTrigger>
                <SelectValue placeholder="Tenant-wide" />
              </SelectTrigger>
              <SelectContent>
                {branchOptions.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.id === TENANT_WIDE_BRANCH ? 'Tenant-wide' : formatBranchName(b)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button type="button" onClick={handleGrant} disabled={loading} className="w-full">
              Grant role
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label>New branch name</Label>
            <Input value={newBranchName} onChange={e => setNewBranchName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>New branch code (optional)</Label>
            <Input value={newBranchCode} onChange={e => setNewBranchCode(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button type="button" variant="outline" onClick={handleCreateBranch} disabled={loading}>
              Create branch
            </Button>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map(r => {
                const branch = r.branchId ? branches.find(b => b.id === r.branchId) : null;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.role}</TableCell>
                    <TableCell>{branch ? formatBranchName(branch) : '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRevoke(r)}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}

              {!loading && roles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-20 text-center text-sm text-muted-foreground">
                    No roles assigned
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
