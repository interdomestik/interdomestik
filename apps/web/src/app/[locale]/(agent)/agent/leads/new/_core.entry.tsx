import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { Button } from '@interdomestik/ui/components/button';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { CreateLeadForm } from './create-lead-form';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function NewLeadPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 pl-0 hover:bg-transparent">
            <Link href="/agent/leads">← Back to Leads</Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Add New Lead</h1>
          <p className="text-muted-foreground">Manually add a potential member to your pipeline.</p>
        </div>
      </div>

      <div className="rounded-lg border bg-white shadow-sm p-6">
        <CreateLeadForm />
      </div>
    </div>
  );
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
