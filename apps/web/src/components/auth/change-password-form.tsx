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
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

export function ChangePasswordForm() {
  const router = useRouter();
  const t = useTranslations('settings.security');
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
        toast.error(t('error'), {
          description: error.message,
        });
        return;
      }

      toast.success(t('success'), {
        description: t('successDescription'),
      });
      form.reset();
      router.refresh();
    });
  }

  return (
    <Card className="border-border/50 bg-card/30 backdrop-blur-md shadow-premium relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 pointer-events-none" />
      <CardHeader>
        <CardTitle className="text-xl font-semibold">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('currentPassword')}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="***"
                      {...field}
                      className="bg-background/50 border-border/50 focus:ring-primary/20 transition-all duration-300 hover:border-primary/50"
                    />
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
                  <FormLabel>{t('newPassword')}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="***"
                      {...field}
                      className="bg-background/50 border-border/50 focus:ring-primary/20 transition-all duration-300 hover:border-primary/50"
                    />
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
                  <FormLabel>{t('confirmPassword')}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="***"
                      {...field}
                      className="bg-background/50 border-border/50 focus:ring-primary/20 transition-all duration-300 hover:border-primary/50"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end pt-4">
              <Button
                type="submit"
                disabled={isPending}
                className="shadow-lg hover:shadow-primary/25 transition-all duration-300"
              >
                {isPending ? t('updating') : t('updatePassword')}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
