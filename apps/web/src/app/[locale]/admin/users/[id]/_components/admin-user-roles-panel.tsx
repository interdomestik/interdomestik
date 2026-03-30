'use client';

import {
  createBranch,
  grantUserRole,
  listBranches,
  listUserRoles,
  revokeUserRole,
} from '@/actions/admin-rbac';
import { OpsTable } from '@/components/ops';
import { getRoleLabel } from '@/lib/roles-i18n';
import {
  ROLE_AGENT,
  ROLE_BRANCH_MANAGER,
  ROLE_MEMBER,
  ROLE_PROMOTER,
  ROLE_STAFF,
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
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
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
  ROLE_STAFF,
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

export function AdminUserRolesPanel({
  userId,
  tenantId,
}: {
  userId: string;
  tenantId: string | null;
}) {
  const router = useRouter();
  const params = useParams<{ locale?: string | string[] }>();
  const t = useTranslations('admin.users_page.roles_panel');
  const tCommon = useTranslations('common');
  const hasTenantContext = Boolean(tenantId);
  const locale = Array.isArray(params?.locale) ? params.locale[0] : params?.locale;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [roles, setRoles] = useState<UserRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLegacyTenantWideAgentRole, setHasLegacyTenantWideAgentRole] = useState(false);

  const [grantRole, setGrantRole] = useState<string>(ROLE_MEMBER);
  const [grantBranchId, setGrantBranchId] = useState<string>(TENANT_WIDE_BRANCH);
  const [customRole, setCustomRole] = useState<string>('');

  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchCode, setNewBranchCode] = useState('');
  const [isGrantPending, setIsGrantPending] = useState(false);
  const [isCreateBranchPending, setIsCreateBranchPending] = useState(false);
  const [pendingRevokeRowId, setPendingRevokeRowId] = useState<string | null>(null);

  const effectiveRoleValue = (grantRole === '__custom__' ? customRole : grantRole).trim();
  const isLegacyTenantWideAgentGrant =
    effectiveRoleValue === ROLE_AGENT &&
    grantBranchId === TENANT_WIDE_BRANCH &&
    hasLegacyTenantWideAgentRole;
  const isBranchMissingForRole =
    isBranchRequiredRole(effectiveRoleValue) &&
    grantBranchId === TENANT_WIDE_BRANCH &&
    !isLegacyTenantWideAgentGrant;

  const branchOptions = useMemo(() => {
    return [{ id: TENANT_WIDE_BRANCH, name: t('tenant_wide'), code: null }, ...branches];
  }, [branches, t]);

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
        toast.error(t('toasts.load_branches_error'));
        setBranches([]);
      }

      if (rolesResult.success) {
        const nextRoles = rolesResult.data ?? [];
        setRoles(nextRoles);
        if (nextRoles.some(role => role.role === ROLE_AGENT && role.branchId === null)) {
          setHasLegacyTenantWideAgentRole(true);
        }
      } else {
        toast.error(t('toasts.load_roles_error'));
        setRoles([]);
      }
    } catch (err) {
      console.error(err);
      toast.error(t('toasts.load_roles_error'));
    } finally {
      setLoading(false);
    }
  }, [tenantId, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleGrant = async () => {
    if (!tenantId) {
      toast.error(t('toasts.tenant_required'));
      return;
    }

    if (!effectiveRoleValue) {
      toast.error(t('toasts.role_required'));
      return;
    }
    if (isBranchMissingForRole) {
      toast.error(t('toasts.branch_required'));
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
        allowLegacyTenantWide: isLegacyTenantWideAgentGrant,
      });

      if ('error' in result) {
        console.error('Failed to grant role', result);
        toast.error(result.error);
        return;
      }

      toast.success(t('toasts.role_granted'));
      setCustomRole('');
      setGrantRole(ROLE_MEMBER);
      setGrantBranchId(TENANT_WIDE_BRANCH);
      await refresh();
      router.refresh();
    } catch (err) {
      console.error('Failed to grant role', err);
      toast.error(t('toasts.grant_error'));
    } finally {
      setIsGrantPending(false);
    }
  };

  const handleRevoke = async (row: UserRoleRow) => {
    if (!tenantId) {
      toast.error(t('toasts.tenant_required'));
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

      toast.success(t('toasts.role_revoked'));
      await refresh();
      router.refresh();
    } catch (err) {
      console.error('Failed to revoke role', err);
      toast.error(t('toasts.revoke_error'));
    } finally {
      setPendingRevokeRowId(null);
    }
  };

  const handleCreateBranch = async () => {
    if (!tenantId) {
      toast.error(t('toasts.tenant_required'));
      return;
    }

    const name = newBranchName.trim();
    if (!name) {
      toast.error(t('toasts.branch_name_required'));
      return;
    }

    setIsCreateBranchPending(true);
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

      toast.success(t('toasts.branch_created'));
      setNewBranchName('');
      setNewBranchCode('');
      await refresh();
    } catch (err) {
      console.error(err);
      toast.error(t('toasts.branch_create_error'));
    } finally {
      setIsCreateBranchPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
        {!hasTenantContext ? (
          <p className="text-sm text-destructive">{t('missing_tenant')}</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label>{t('role_label')}</Label>
            <Select value={grantRole} onValueChange={setGrantRole}>
              <SelectTrigger data-testid="role-select-trigger" disabled={!hasTenantContext}>
                <SelectValue placeholder={t('role_placeholder')} />
              </SelectTrigger>
              <SelectContent data-testid="role-select-content">
                {DEFAULT_ROLE_OPTIONS.map(r => (
                  <SelectItem key={r} value={r} data-testid={`role-option-${r}`}>
                    {getRoleLabel(tCommon, r, r)}
                  </SelectItem>
                ))}
                <SelectItem value="__custom__" data-testid="role-option-custom">
                  {t('custom_role')}
                </SelectItem>
              </SelectContent>
            </Select>
            {grantRole === '__custom__' ? (
              <Input
                value={customRole}
                onChange={e => setCustomRole(e.target.value)}
                placeholder={t('custom_role_placeholder')}
              />
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label>{t('branch_label')}</Label>
            <Select value={grantBranchId} onValueChange={setGrantBranchId}>
              <SelectTrigger data-testid="branch-select-trigger" disabled={!hasTenantContext}>
                <SelectValue placeholder={t('tenant_wide')} />
              </SelectTrigger>
              <SelectContent data-testid="branch-select-content">
                {branchOptions.map(b => (
                  <SelectItem key={b.id} value={b.id} data-testid={`branch-option-${b.id}`}>
                    {b.id === TENANT_WIDE_BRANCH ? t('tenant_wide') : formatBranchName(b)}
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
              {t('grant_role')}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label>{t('new_branch_name')}</Label>
            <Input value={newBranchName} onChange={e => setNewBranchName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>{t('new_branch_code')}</Label>
            <Input value={newBranchCode} onChange={e => setNewBranchCode(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleCreateBranch}
              disabled={!hasTenantContext || isCreateBranchPending || !newBranchName.trim()}
            >
              {t('create_branch')}
            </Button>
          </div>
        </div>

        <div data-testid="user-roles-table">
          <OpsTable
            columns={[
              { key: 'role', header: t('table.role') },
              { key: 'branch', header: t('table.branch') },
            ]}
            rows={roles.map(r => {
              const branch = r.branchId ? branches.find(b => b.id === r.branchId) : null;
              return {
                id: r.id,
                cells: [
                  <span key="role" className="font-medium">
                    {getRoleLabel(tCommon, r.role, r.role)}
                  </span>,
                  <span key="branch">{branch ? formatBranchName(branch) : t('tenant_wide')}</span>,
                ],
                actions: (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => handleRevoke(r)}
                    disabled={!hasTenantContext || isGrantPending || pendingRevokeRowId !== null}
                  >
                    {t('remove')}
                  </Button>
                ),
              };
            })}
            loading={loading}
            loadingLabel={tCommon('loading')}
            emptyLabel={t('empty')}
            actionsHeader={t('table.actions')}
          />
        </div>
      </CardContent>
    </Card>
  );
}
