'use client';

import { createBranch } from '@/actions/admin-rbac';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from '@interdomestik/ui';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().optional(),
});

type FormDetail = z.infer<typeof formSchema>;

export function CreateBranchDialog() {
  const t = useTranslations('admin.branches');
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormDetail>({
    resolver: zodResolver(formSchema),
  });

  async function onSubmit(data: FormDetail) {
    setIsPending(true);
    try {
      const result = await createBranch({
        name: data.name,
        code: data.code || null,
      });

      if ('success' in result && result.success) {
        toast.success(t('createSuccess'));
        setOpen(false);
        reset();
        // Ideally revalidatePath happens on server
      } else {
        toast.error('error' in result ? result.error : t('createError'));
      }
    } catch {
      toast.error(t('createError'));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t('createButton')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('createTitle')}</DialogTitle>
          <DialogDescription>{t('createDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="base-branch-name">{t('fields.name')}</Label>
            <Input id="base-branch-name" {...register('name')} placeholder="e.g. Skopje Center" />
            {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="base-branch-code">{t('fields.code')}</Label>
            <Input id="base-branch-code" {...register('code')} placeholder="e.g. SK-01" />
            {errors.code && <p className="text-sm text-red-500">{errors.code.message}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
