'use client';

import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@interdomestik/ui';
import { MoreHorizontal, Pencil, Trash } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { deleteBranch } from '@/actions/admin-rbac';

import { EditBranchSheet } from './edit-branch-sheet';

interface Branch {
  id: string;
  name: string;
  slug: string;
  code: string | null;
  isActive: boolean;
  tenantId: string;
}

interface BranchesTableProps {
  initialData: Branch[];
}

export function BranchesTable({ initialData }: BranchesTableProps) {
  const t = useTranslations('admin.branches');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState(initialData);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [deletingBranch, setDeletingBranch] = useState<Branch | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const showInactive = searchParams.get('showInactive') === 'true';

  const handleToggleInactive = (checked: boolean | 'indeterminate') => {
    const isChecked = checked === true;
    const params = new URLSearchParams(searchParams.toString());
    if (isChecked) {
      params.set('showInactive', 'true');
    } else {
      params.delete('showInactive');
    }
    router.replace(`?${params.toString()}`);
    // Refresh to trigger server re-render with new params
    router.refresh();
  };

  const handleDelete = async () => {
    if (!deletingBranch) return;
    setIsDeleting(true);
    try {
      const result = await deleteBranch({ branchId: deletingBranch.id });
      if (result.success) {
        toast.success(t('deleteSuccess'));
        // Optimistic update - but server refresh will eventually sync
        setData(prev => prev.filter(b => b.id !== deletingBranch.id));
        router.refresh();
      } else {
        // @ts-expect-error - error existence inferred
        toast.error(result.error || t('deleteError'));
      }
    } catch {
      toast.error(t('deleteError'));
    } finally {
      setIsDeleting(false);
      setDeletingBranch(null);
    }
  };

  const handleUpdate = (updatedBranch: Branch) => {
    // Optimistic update
    setData(prev => prev.map(b => (b.id === updatedBranch.id ? updatedBranch : b)));
    setEditingBranch(null);
    router.refresh();
  };

  return (
    <>
      <div className="flex items-center space-x-2 py-4">
        <Checkbox
          id="show-inactive"
          checked={showInactive}
          onCheckedChange={handleToggleInactive}
        />
        <Label htmlFor="show-inactive">{t('actions.showInactive') || 'Show Inactive'}</Label>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('fields.name')}</TableHead>
              <TableHead>{t('fields.code')}</TableHead>
              <TableHead>{t('fields.slug')}</TableHead>
              <TableHead>{t('fields.status')}</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(branch => (
              <TableRow key={branch.id}>
                <TableCell className="font-medium">{branch.name}</TableCell>
                <TableCell>{branch.code || '-'}</TableCell>
                <TableCell>{branch.slug}</TableCell>
                <TableCell>
                  <Badge variant={branch.isActive ? 'default' : 'secondary'}>
                    {branch.isActive ? t('status.active') : t('status.inactive')}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">{t('actions.open')}</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>{t('actions.label')}</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => setEditingBranch(branch)}>
                        <Pencil className="mr-2 h-4 w-4" /> {t('actions.edit')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-500"
                        onClick={() => setDeletingBranch(branch)}
                      >
                        <Trash className="mr-2 h-4 w-4" /> {t('actions.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  {t('noResults')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!deletingBranch} onOpenChange={open => !open && setDeletingBranch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('deleteConfirm', { name: deletingBranch?.name || '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingBranch(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={e => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={isDeleting}
            >
              {isDeleting ? t('deleting') : t('actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editingBranch && (
        <EditBranchSheet
          branch={editingBranch}
          isOpen={!!editingBranch}
          onClose={() => setEditingBranch(null)}
          onUpdate={handleUpdate}
        />
      )}
    </>
  );
}
