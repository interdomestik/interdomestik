export const dynamic = 'force-dynamic';

export async function generateStaticParams() {
  return [];
}

export default async function AdminClaimDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Temporary Stub to fix build
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Claim Details</h1>
      <p>ID: {id}</p>
      <p className="text-muted-foreground mt-4">
        Details are currently unavailable while we optimize the admin dashboard build process.
      </p>
    </div>
  );
}
