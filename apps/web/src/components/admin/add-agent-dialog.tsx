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
  branchId: z.string().optional(),
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
      branchId: 'unassigned', // Use 'unassigned' to represent null in Select
    },
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: z.infer<typeof addAgentSchema>) {
    try {
      const branchId = values.branchId === 'unassigned' ? undefined : values.branchId;

      const result = await grantUserRole({
        userId: values.userId,
        role: 'agent',
        branchId,
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
      setOpen(false);
      form.reset();
      router.refresh();
    } catch {
      toast.error(t('add_agent_error'), {
        description: t('unexpected_error'),
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('select_branch_placeholder')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="unassigned">{t('no_branch')}</SelectItem>
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
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
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
