'use client';

import { createBranch } from '@/actions/admin-rbac.core';
import { zodResolver } from '@hookform/resolvers/zod';
import { createBranchSchema } from '@interdomestik/domain-users/admin/schemas';
import { Button } from '@interdomestik/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@interdomestik/ui/components/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@interdomestik/ui/components/form';
import { Input } from '@interdomestik/ui/components/input';
import { Loader2, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

export function CreateBranchDialog() {
  const t = useTranslations('admin.branches');
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const form = useForm<z.infer<typeof createBranchSchema>>({
    resolver: zodResolver(createBranchSchema),
    defaultValues: {
      name: '',
      code: '',
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: z.infer<typeof createBranchSchema>) {
    try {
      const result = await createBranch(values);

      if (!result.success) {
        toast.error(t('create_error'), {
          description: result.error,
        });
        return;
      }

      toast.success(t('create_success'), {
        description: t('create_success_description', { name: values.name }),
      });
      setOpen(false);
      form.reset();
      router.refresh();
    } catch {
      toast.error(t('create_error'), {
        description: t('unexpected_error'),
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="create-branch-trigger">
          <Plus className="mr-2 h-4 w-4" />
          {t('create_branch')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('create_branch_title')}</DialogTitle>
          <DialogDescription>{t('create_branch_description')}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('field_name')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('placeholder_name')}
                      {...field}
                      data-testid="branch-input-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('field_code')}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('placeholder_code')}
                      {...field}
                      value={field.value || ''}
                      data-testid="branch-input-code"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting} data-testid="branch-submit">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('submit')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
