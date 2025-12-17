'use client';

import { useRouter } from '@/i18n/routing';
import { authClient } from '@/lib/auth-client';
import { changePasswordSchema, type ChangePasswordFormValues } from '@/lib/validators/auth';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@interdomestik/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui/components/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@interdomestik/ui/components/form';
import { Input } from '@interdomestik/ui/components/input';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

export function ChangePasswordForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  async function onSubmit(data: ChangePasswordFormValues) {
    startTransition(async () => {
      const { error } = await authClient.changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        revokeOtherSessions: true,
      });

      if (error) {
        toast.error('Failed to change password', {
          description: error.message,
        });
        return;
      }

      toast.success('Password updated', {
        description: 'Your password has been changed successfully.',
      });
      form.reset();
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
        <CardDescription>Ensure your account is secure by using a strong password.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="***" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="***" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="***" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end">
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Updating...' : 'Update Password'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
