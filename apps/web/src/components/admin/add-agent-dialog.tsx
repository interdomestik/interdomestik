'use client';

import { grantUserRole } from '@/actions/admin-rbac.core';
import { zodResolver } from '@hookform/resolvers/zod';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@interdomestik/ui/components/select';
import { Loader2, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';

const addAgentSchema = z.object({
  userId: z.string().min(1, 'User is required'),
  branchId: z.string().min(1, 'Branch is required'),
});

type User = {
  id: string;
  name: string | null;
  email: string;
};

type Branch = {
  id: string;
  name: string;
};

type AddAgentDialogProps = {
  users: User[];
  branches: Branch[];
};

export function AddAgentDialog({ users, branches }: AddAgentDialogProps) {
  const t = useTranslations('admin.users_page');
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const form = useForm<z.infer<typeof addAgentSchema>>({
    resolver: zodResolver(addAgentSchema as any),
    defaultValues: {
      userId: '',
      branchId: '',
    },
  });

  const isSubmitting = form.formState.isSubmitting;
  const selectedUserId = form.watch('userId');
  const selectedBranchId = form.watch('branchId');

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    form.reset({
      userId: '',
      branchId: '',
    });
  }

  async function onSubmit(values: z.infer<typeof addAgentSchema>) {
    try {
      const result = await grantUserRole({
        userId: values.userId,
        role: 'agent',
        branchId: values.branchId,
      });

      if (!result.success) {
        toast.error(t('add_agent_error'), {
          description: result.error,
        });
        return;
      }

      toast.success(t('add_agent_success'), {
        description: t('add_agent_success_desc'),
      });
      handleOpenChange(false);
      router.refresh();
    } catch {
      toast.error(t('add_agent_error'), {
        description: t('unexpected_error'),
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          {t('add_agent')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('add_agent_title')}</DialogTitle>
          <DialogDescription>{t('add_agent_description')}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="userId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('select_user')}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('select_user_placeholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {users.map(user => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name || user.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="branchId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('select_branch')}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('select_branch_placeholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {branches.map(branch => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting || !selectedUserId || !selectedBranchId}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('confirm')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
