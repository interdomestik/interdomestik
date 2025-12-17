import { updateClaimStatus } from '@/actions/admin-claims';
import { Link } from '@/i18n/routing';
import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database/db';
import { claims } from '@interdomestik/database/schema';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
} from '@interdomestik/ui';
import { eq } from 'drizzle-orm';
import { ArrowLeft, Building, Calendar, DollarSign, FileText, Tag } from 'lucide-react';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export async function generateStaticParams() {
  return [];
}

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'verification', label: 'Verification' },
  { value: 'evaluation', label: 'Evaluation' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'court', label: 'Court' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'rejected', label: 'Rejected' },
];

function getStatusColor(status: string | null) {
  switch (status) {
    case 'resolved':
      return 'bg-green-500';
    case 'rejected':
      return 'bg-red-500';
    case 'negotiation':
    case 'court':
      return 'bg-yellow-500';
    default:
      return 'bg-blue-500';
  }
}

export default async function AdminClaimDetailsPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || session.user.role !== 'admin') {
    redirect(`/${locale}/login`);
  }

  const claim = await db.query.claims.findFirst({
    where: eq(claims.id, id),
  });

  if (!claim) {
    notFound();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/claims">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{claim.title}</h1>
          <p className="text-sm text-muted-foreground">Claim ID: {claim.id}</p>
        </div>
        <Badge className={getStatusColor(claim.status)} variant="secondary">
          {claim.status}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Claim Details Card */}
        <Card>
          <CardHeader>
            <CardTitle>Claim Details</CardTitle>
            <CardDescription>Information about this claim</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Building className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Company</p>
                <p className="font-medium">{claim.companyName}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Category</p>
                <p className="font-medium capitalize">{claim.category}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Claim Amount</p>
                <p className="font-medium">
                  {claim.claimAmount ? `${claim.claimAmount} ${claim.currency}` : 'Not specified'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Created</p>
                <p className="font-medium" suppressHydrationWarning>
                  {claim.createdAt ? new Date(claim.createdAt).toLocaleDateString() : '-'}
                </p>
              </div>
            </div>

            <Separator />

            <div className="flex items-start gap-3">
              <FileText className="h-4 w-4 text-muted-foreground mt-1" />
              <div>
                <p className="text-sm text-muted-foreground">Description</p>
                <p className="text-sm">{claim.description || 'No description provided.'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status Management Card */}
        <Card>
          <CardHeader>
            <CardTitle>Manage Status</CardTitle>
            <CardDescription>Update the claim status</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateClaimStatus}>
              <input type="hidden" name="claimId" value={claim.id} />
              <input type="hidden" name="locale" value={locale} />
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Current Status</label>
                  <Select name="status" defaultValue={claim.status || 'draft'}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full">
                  Update Status
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
