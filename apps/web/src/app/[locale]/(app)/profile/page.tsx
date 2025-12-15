import { ProfileForm } from '@/components/auth/profile-form';
import { auth } from '@/lib/auth';
import { Separator } from '@interdomestik/ui/components/separator';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function ProfilePage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect('/auth/sign-in');
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Profile</h3>
        <p className="text-sm text-muted-foreground">
          Manage your account settings and preferences.
        </p>
      </div>
      <Separator />
      <div className="max-w-xl">
        <ProfileForm
          user={{
            name: session.user.name,
            image: session.user.image,
          }}
        />
      </div>
    </div>
  );
}
