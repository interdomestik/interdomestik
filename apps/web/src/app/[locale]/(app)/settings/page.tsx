import { ChangePasswordForm } from '@/components/auth/change-password-form';
import { auth } from '@/lib/auth';
import { Separator } from '@interdomestik/ui/components/separator';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function SettingsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/auth/sign-in');
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Account Settings</h3>
        <p className="text-sm text-muted-foreground">
          Manage your account security and preferences.
        </p>
      </div>
      <Separator />
      <div className="max-w-xl space-y-8">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
