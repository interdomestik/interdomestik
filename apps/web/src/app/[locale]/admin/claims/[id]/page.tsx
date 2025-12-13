import { updateClaimStatus } from '@/actions/claims';
import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database/db';
import { claims } from '@interdomestik/database/schema';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@interdomestik/ui';
import { eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

export default async function AdminClaimDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || session.user.role !== 'admin') return notFound();

  const claim = await db.query.claims.findFirst({
    where: eq(claims.id, id),
    with: {
      user: true, // Fetch user details too if we want to show WHO submitted it
    },
  });

  if (!claim) return notFound();

  async function changeStatus(formData: FormData) {
    'use server';
    const newStatus = formData.get('status') as string;
    if (newStatus) {
      await updateClaimStatus(id, newStatus);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/claims">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Claim Management</h2>
            <p className="text-muted-foreground text-sm">Reviewing Claim #{claim.id}</p>
          </div>
        </div>

        <form action={changeStatus} className="flex items-center gap-2">
          <Select name="status" defaultValue={claim.status || 'draft'}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit">Update</Button>
        </form>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Claim Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <span className="font-semibold block text-sm text-muted-foreground">Title</span>
              <span className="text-lg">{claim.title}</span>
            </div>
            <div>
              <span className="font-semibold block text-sm text-muted-foreground">Company</span>
              <span>{claim.companyName}</span>
            </div>
            <div>
              <span className="font-semibold block text-sm text-muted-foreground">Amount</span>
              {claim.claimAmount ? `${claim.claimAmount} ${claim.currency}` : 'N/A'}
            </div>
            <div>
              <span className="font-semibold block text-sm text-muted-foreground">Category</span>
              <span className="capitalize">{claim.category}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Submitter Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <span className="font-semibold block text-sm text-muted-foreground">User ID</span>
              <code className="text-xs bg-muted p-1 rounded">{claim.userId}</code>
            </div>
            <div suppressHydrationWarning>
              <span className="font-semibold block text-sm text-muted-foreground">
                Submitted At
              </span>
              {claim.createdAt?.toLocaleString()}
            </div>
            {/* If we had user relation configured properly we could show name/email here */}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {claim.description || 'No description provided.'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
