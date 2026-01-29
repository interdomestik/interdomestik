import { QuickRegisterForm } from '@/features/agent/pos/components/quick-register-form';
import { auth } from '@/lib/auth';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function AgentPOSPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user?.role !== 'agent') {
    redirect('/member');
  }

  const t = await getTranslations('agent.pos');

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-8 px-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-display font-bold tracking-tight">Rapid Registration (POS)</h1>
        <p className="text-muted-foreground">
          Register a new member instantly.{' '}
          <span className="font-semibold text-green-600">50% commission</span> applied
          automatically.
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <QuickRegisterForm agentId={session.user.id} />
      </div>
    </div>
  );
}
