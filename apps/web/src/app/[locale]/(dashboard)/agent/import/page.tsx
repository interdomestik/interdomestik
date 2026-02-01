import { CSVUploader } from '@/features/agent/import/components/csv-uploader';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function AgentImportPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user?.role !== 'agent') {
    redirect('/member');
  }

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8 px-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-display font-bold tracking-tight">Enterprise Bulk Import</h1>
        <p className="text-muted-foreground">
          Upload a CSV file to register members in bulk. Optimized for brokers with large client
          bases.
        </p>
      </div>

      <div className="rounded-[2rem] border bg-card/50 backdrop-blur-xl p-8 shadow-sm">
        <CSVUploader />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="p-6 rounded-2xl bg-muted/30 border space-y-2">
          <h3 className="font-bold">Template Guidelines</h3>
          <p className="text-sm text-muted-foreground">
            Use columns: <strong>fullName, phone, email, plateNumber</strong>.
          </p>
          <p className="text-xs text-blue-600 font-medium cursor-pointer hover:underline">
            Download CSV Template
          </p>
        </div>
        <div className="p-6 rounded-2xl bg-muted/30 border space-y-2">
          <h3 className="font-bold">Billing Model</h3>
          <p className="text-sm text-muted-foreground">
            Enterprise imports are billed via monthly invoice. Net total = 50% of plan price per
            active member.
          </p>
        </div>
      </div>
    </div>
  );
}
