'use client';

import { useRouter } from '@/i18n/routing';
import { authClient } from '@/lib/auth-client';
import { profileSchema, type ProfileFormValues } from '@/lib/validators/profile';
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

interface ProfileFormProps {
  user: {
    name: string;
    image?: string | null;
  };
}

export function ProfileForm({ user }: ProfileFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user.name || '',
      image: user.image || '',
    },
  });

  async function onSubmit(data: ProfileFormValues) {
    startTransition(async () => {
      const { error } = await authClient.updateUser({
        name: data.name,
        image: data.image || undefined,
      });

      if (error) {
        toast.error('Failed to update profile', {
          description: error.message,
        });
        return;
      }

      toast.success('Profile updated', {
        description: 'Your changes have been saved successfully.',
      });
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Update your personal information.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Future: Add Avatar Upload/Preview here */}

            <div className="flex justify-end">
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
