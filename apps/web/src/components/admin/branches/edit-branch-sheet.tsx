'use client';

import { updateBranch } from '@/actions/admin-rbac';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Checkbox,
  Input,
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().optional(),
  isActive: z.boolean(),
});

type FormDetail = z.infer<typeof formSchema>;

interface EditBranchSheetProps {
  branch: {
    id: string;
    name: string;
    code: string | null;
    isActive: boolean;
    tenantId?: string;
    slug?: string;
  };
  isOpen: boolean;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdate: (updatedBranch: any) => void;
}

export function EditBranchSheet({ branch, isOpen, onClose, onUpdate }: EditBranchSheetProps) {
  const t = useTranslations('admin.branches');
  const [isPending, setIsPending] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormDetail>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: branch.name,
      code: branch.code || '',
      isActive: branch.isActive,
    },
  });

  // Reset form when branch changes
  useEffect(() => {
    if (isOpen) {
      reset({
        name: branch.name,
        code: branch.code || '',
        isActive: branch.isActive,
      });
    }
  }, [branch, isOpen, reset]);

  async function onSubmit(data: FormDetail) {
    setIsPending(true);
    try {
      const result = await updateBranch({
        branchId: branch.id,
        data: {
          name: data.name,
          code: data.code || null,
          isActive: data.isActive,
        },
      });

      if ('success' in result && result.success) {
        toast.success(t('updateSuccess'));
        onUpdate({ ...branch, ...data });
        onClose();
      } else {
        toast.error('error' in result ? result.error : t('updateError'));
      }
    } catch {
      toast.error(t('updateError'));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={open => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('editTitle')}</SheetTitle>
          <SheetDescription>{t('editDescription')}</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pt-6">
          <div className="space-y-2">
            <Label htmlFor="edit-branch-name">{t('fields.name')}</Label>
            <Input id="edit-branch-name" {...register('name')} data-testid="branch-name-input" />
            {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-branch-code">{t('fields.code')}</Label>
            <Input id="edit-branch-code" {...register('code')} data-testid="branch-code-input" />
            {errors.code && <p className="text-sm text-red-500">{errors.code.message}</p>}
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="edit-branch-active"
              checked={watch('isActive')}
              onCheckedChange={checked => setValue('isActive', checked === true)}
            />
            <Label htmlFor="edit-branch-active">{t('fields.isActive')}</Label>
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={isPending} data-testid="branch-submit-button">
              {isPending ? t('saving') : t('save')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
