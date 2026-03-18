import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const PILOT_TENANT_ID = 'tenant_ks';
const PILOT_START = new Date('2026-03-18T00:00:00.000Z');
const PILOT_END = new Date('2026-03-25T00:00:00.000Z');

function formatRatio(passed: number, total: number): string {
  if (total === 0) {
    return 'n/a';
  }

  return `${((passed / total) * 100).toFixed(1)}%`;
}

async function main() {
  console.log('--- Week-1 SLA Rollup Aggregate Query ---');

  const { db } = await import('@interdomestik/database');

  const pilotClaims = await db.query.claims.findMany({
    with: {
      messages: true,
      stageHistory: true,
    },
  });

  const allClaims = pilotClaims.filter(
    claim =>
      claim.tenantId === PILOT_TENANT_ID &&
      Boolean(claim.createdAt) &&
      claim.createdAt! >= PILOT_START &&
      claim.createdAt! < PILOT_END
  );

  console.log(`\n--- [General Cohort Rollup] ---`);
  console.log(`Total pilot claims in cohort: ${allClaims.length}`);

  const submittedClaims = allClaims.filter(c => c.status !== 'draft');
  console.log(`Submitted claims (SLA Denominator): ${submittedClaims.length}`);

  const triageResults = submittedClaims.map(claim => {
    const triageEvent = [...claim.stageHistory]
      .filter(event => event.toStatus === 'verification' && Boolean(event.createdAt))
      .sort((left, right) => left.createdAt!.getTime() - right.createdAt!.getTime())[0];

    if (!claim.createdAt || !triageEvent?.createdAt) {
      return { claimId: claim.id, withinSla: false, missingEvidence: true };
    }

    const elapsedHours = (triageEvent.createdAt.getTime() - claim.createdAt.getTime()) / 3_600_000;
    return { claimId: claim.id, withinSla: elapsedHours <= 4, missingEvidence: false };
  });

  const triagedClaims = triageResults.filter(result => !result.missingEvidence);
  const triagePassed = triagedClaims.filter(result => result.withinSla).length;
  const triageBreaches = triagedClaims.length - triagePassed;

  const updateResults = submittedClaims.map(claim => {
    const triageEvent = [...claim.stageHistory]
      .filter(event => event.toStatus === 'verification' && Boolean(event.createdAt))
      .sort((left, right) => left.createdAt!.getTime() - right.createdAt!.getTime())[0];

    const publicUpdate = [...claim.messages]
      .filter(message => message.isInternal === false && Boolean(message.createdAt))
      .sort((left, right) => left.createdAt!.getTime() - right.createdAt!.getTime())[0];

    if (!triageEvent?.createdAt || !publicUpdate?.createdAt) {
      return { claimId: claim.id, withinSla: false, missingEvidence: true };
    }

    const elapsedHours =
      (publicUpdate.createdAt.getTime() - triageEvent.createdAt.getTime()) / 3_600_000;
    return { claimId: claim.id, withinSla: elapsedHours <= 24, missingEvidence: false };
  });

  const updatedClaims = updateResults.filter(result => !result.missingEvidence);
  const updatePassed = updatedClaims.filter(result => result.withinSla).length;
  const updateBreaches = updatedClaims.length - updatePassed;

  console.log(`\n--- [SLA Performance] ---`);
  console.log(`Triage Breaches found: ${triageBreaches}`);
  console.log(`Public Update Breaches found: ${updateBreaches}`);

  console.log(`\n--- [Weekly Ratios] ---`);
  console.log(
    `Triage SLA: ${triagePassed} / ${triagedClaims.length} (${formatRatio(triagePassed, triagedClaims.length)})`
  );
  console.log(
    `Update SLA: ${updatePassed} / ${updatedClaims.length} (${formatRatio(updatePassed, updatedClaims.length)})`
  );
  console.log(
    `Claims missing triage evidence: ${triageResults.filter(result => result.missingEvidence).length}`
  );
  console.log(
    `Claims missing public update evidence: ${updateResults.filter(result => result.missingEvidence).length}`
  );
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
