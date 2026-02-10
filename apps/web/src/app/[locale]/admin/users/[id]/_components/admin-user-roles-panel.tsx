'use client';

import {
  createBranch,
  grantUserRole,
  listBranches,
  listUserRoles,
  revokeUserRole,
} from '@/actions/admin-rbac';
import { OpsTable } from '@/components/ops';
import {
  ROLE_AGENT,
  ROLE_BRANCH_MANAGER,
  ROLE_MEMBER,
  ROLE_PROMOTER,
  ROLE_TENANT_ADMIN,
} from '@/lib/roles.core';
import { isBranchRequiredRole } from '@interdomestik/domain-users/admin/role-rules';
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
import { useParams, useRouter, useSearchParams } from 'next/navigation';
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

const DEFAULT_ROLE_OPTIONS = [
  ROLE_TENANT_ADMIN,
  ROLE_BRANCH_MANAGER,
  ROLE_AGENT,
  ROLE_MEMBER,
  ROLE_PROMOTER,
];
const TENANT_WIDE_BRANCH = '__tenant__';

function formatBranchName(b: Branch | { name: string; code?: string | null }) {
  const codeSuffix = b.code ? ` (${b.code})` : '';
  return `${b.name}${codeSuffix}`;
}

export function AdminUserRolesPanel({ userId }: { userId: string }) {
  const router = useRouter();
  const params = useParams<{ locale?: string | string[] }>();
  const searchParams = useSearchParams();
  const tenantId = searchParams.get('tenantId') ?? undefined;
  const hasTenantContext = Boolean(tenantId);
  const locale = Array.isArray(params?.locale) ? params.locale[0] : params?.locale;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [roles, setRoles] = useState<UserRoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [grantRole, setGrantRole] = useState<string>(ROLE_MEMBER);
  const [grantBranchId, setGrantBranchId] = useState<string>(TENANT_WIDE_BRANCH);
  const [customRole, setCustomRole] = useState<string>('');

  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchCode, setNewBranchCode] = useState('');
  const [isGrantPending, setIsGrantPending] = useState(false);
  const [pendingRevokeRowId, setPendingRevokeRowId] = useState<string | null>(null);

  const effectiveRoleValue = (grantRole === '__custom__' ? customRole : grantRole).trim();
  const isBranchMissingForRole =
    isBranchRequiredRole(effectiveRoleValue) && grantBranchId === TENANT_WIDE_BRANCH;

  const branchOptions = useMemo(() => {
    return [{ id: TENANT_WIDE_BRANCH, name: 'Tenant-wide', code: null }, ...branches];
  }, [branches]);

  const refresh = useCallback(async () => {
    if (!tenantId) {
      setBranches([]);
      setRoles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [branchesResult, rolesResult] = await Promise.all([
        listBranches({ tenantId }),
        listUserRoles({ tenantId, userId }),
      ]);

      if (branchesResult.success) {
        setBranches(branchesResult.data ?? []);
      } else {
        toast.error('Failed to load branches');
        setBranches([]);
      }

      if (rolesResult.success) {
        setRoles(rolesResult.data ?? []);
      } else {
        toast.error('Failed to load roles');
        setRoles([]);
      }
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
    if (!tenantId) {
      toast.error('Tenant context is required to manage roles');
      return;
    }

    if (!effectiveRoleValue) {
      toast.error('Role is required');
      return;
    }
    if (isBranchMissingForRole) {
      toast.error('Branch is required for this role. Please select a branch.');
      return;
    }

    setIsGrantPending(true);
    try {
      const result = await grantUserRole({
        tenantId,
        userId,
        role: effectiveRoleValue,
        branchId: grantBranchId === TENANT_WIDE_BRANCH ? undefined : grantBranchId,
        locale,
      });

      if ('error' in result) {
        console.error('Failed to grant role', result);
        toast.error(result.error);
        return;
      }

      toast.success('Role granted');
      setCustomRole('');
      setGrantRole(ROLE_MEMBER);
      setGrantBranchId(TENANT_WIDE_BRANCH);
      await refresh();
      router.refresh();
    } catch (err) {
      console.error('Failed to grant role', err);
      toast.error('Failed to grant role');
    } finally {
      setIsGrantPending(false);
    }
  };

  const handleRevoke = async (row: UserRoleRow) => {
    if (!tenantId) {
      toast.error('Tenant context is required to manage roles');
      return;
    }

    setPendingRevokeRowId(row.id);
    try {
      const result = await revokeUserRole({
        tenantId,
        userId,
        role: row.role,
        branchId: row.branchId ?? undefined,
        locale,
      });

      if ('error' in result) {
        console.error('Failed to revoke role', result);
        toast.error(result.error);
        return;
      }

      toast.success('Role revoked');
      await refresh();
      router.refresh();
    } catch (err) {
      console.error('Failed to revoke role', err);
      toast.error('Failed to revoke role');
    } finally {
      setPendingRevokeRowId(null);
    }
  };

  const handleCreateBranch = async () => {
    if (!tenantId) {
      toast.error('Tenant context is required to manage branches');
      return;
    }

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
        {!hasTenantContext ? (
          <p className="text-sm text-destructive">
            Missing tenant context. Reopen this profile from the tenant user list.
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label>Role</Label>
            <Select value={grantRole} onValueChange={setGrantRole}>
              <SelectTrigger data-testid="role-select-trigger" disabled={!hasTenantContext}>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent data-testid="role-select-content">
                {DEFAULT_ROLE_OPTIONS.map(r => (
                  <SelectItem key={r} value={r} data-testid={`role-option-${r}`}>
                    {r}
                  </SelectItem>
                ))}
                <SelectItem value="__custom__" data-testid="role-option-custom">
                  Custom…
                </SelectItem>
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
              <SelectTrigger data-testid="branch-select-trigger" disabled={!hasTenantContext}>
                <SelectValue placeholder="Tenant-wide" />
              </SelectTrigger>
              <SelectContent data-testid="branch-select-content">
                {branchOptions.map(b => (
                  <SelectItem key={b.id} value={b.id} data-testid={`branch-option-${b.id}`}>
                    {b.id === TENANT_WIDE_BRANCH ? 'Tenant-wide' : formatBranchName(b)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button
              type="button"
              onClick={handleGrant}
              disabled={
                !hasTenantContext ||
                loading ||
                isGrantPending ||
                pendingRevokeRowId !== null ||
                isBranchMissingForRole
              }
              className="w-full"
            >
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
            <Button
              type="button"
              variant="outline"
              onClick={handleCreateBranch}
              disabled={!hasTenantContext || loading}
            >
              Create branch
            </Button>
          </div>
        </div>

        <div data-testid="user-roles-table">
          <OpsTable
            columns={[
              { key: 'role', header: 'Role' },
              { key: 'branch', header: 'Branch' },
            ]}
            rows={roles.map(r => {
              const branch = r.branchId ? branches.find(b => b.id === r.branchId) : null;
              return {
                id: r.id,
                cells: [
                  <span key="role" className="font-medium">
                    {r.role}
                  </span>,
                  <span key="branch">{branch ? formatBranchName(branch) : '—'}</span>,
                ],
                actions: (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => handleRevoke(r)}
                    disabled={!hasTenantContext || isGrantPending || pendingRevokeRowId !== null}
                  >
                    Remove
                  </Button>
                ),
              };
            })}
            loading={loading}
            emptyLabel="No roles assigned"
            actionsHeader="Actions"
          />
        </div>
      </CardContent>
    </Card>
  );
}
