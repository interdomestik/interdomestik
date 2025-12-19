import { AgentClaimsTable } from '@/components/agent/agent-claims-table';
import { claims, db, user } from '@interdomestik/database';
import { desc, eq } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export default async function AgentClaimsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('agent');

  // Fetch all claims with user information
  const allClaims = await db
    .select({
      id: claims.id,
      title: claims.title,
      status: claims.status,
      createdAt: claims.createdAt,
      companyName: claims.companyName,
      claimAmount: claims.claimAmount,
      currency: claims.currency,
      claimantName: user.name,
      claimantEmail: user.email,
    })
    .from(claims)
    .leftJoin(user, eq(claims.userId, user.id))
    .orderBy(desc(claims.createdAt))
    .limit(50); // Limit for performance

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('claims_queue')}</h1>
          <p className="text-muted-foreground">{t('manage_triage')}</p>
        </div>
      </div>

      <AgentClaimsTable claims={allClaims} />
    </div>
  );
}
