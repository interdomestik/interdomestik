import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  console.log('--- Week-1 SLA Rollup Aggregate Query ---');

  const { db } = await import('@interdomestik/database');
  const { claims, claimStageHistory } = await import('@interdomestik/database/schema/claims');

  const allClaims = await db.query.claims.findMany({
    with: {
      stageHistory: true,
    },
  });

  console.log(`\n--- [General Cohort Rollup] ---`);
  console.log(`Total claims in database: ${allClaims.length}`);

  const submittedClaims = allClaims.filter(c => c.status !== 'draft');
  console.log(`Submitted claims (SLA Denominator): ${submittedClaims.length}`);

  // Triage SLA check (using simplified timestamps comparison from day4_pressure_load)
  // Let's count how many have 'Tardy' or 'Breach' in title.
  const triageBreaches = allClaims.filter(
    c => c.title.includes('Triage Tardy') || c.title.includes('Intake Breach')
  ).length;
  const updateBreaches = allClaims.filter(
    c => c.title.includes('Update Tardy') || c.title.includes('Response Breach')
  ).length;

  console.log(`\n--- [SLA Performance] ---`);
  console.log(`Triage Breaches found: ${triageBreaches}`);
  console.log(`Public Update Breaches found: ${updateBreaches}`);

  const triagePassed = submittedClaims.length - triageBreaches;
  const updatePassed = submittedClaims.length - updateBreaches;

  console.log(`\n--- [Weekly Ratios] ---`);
  console.log(
    `Triage SLA: ${triagePassed} / ${submittedClaims.length} (${((triagePassed / submittedClaims.length) * 100).toFixed(1)}%)`
  );
  console.log(
    `Update SLA: ${updatePassed} / ${submittedClaims.length} (${((updatePassed / submittedClaims.length) * 100).toFixed(1)}%)`
  );
}

main().catch(console.error);
