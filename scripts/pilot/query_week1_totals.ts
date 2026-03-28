import dotenv from 'dotenv';
import { computePilotWeekRollup } from './pilot-rollup-core';

dotenv.config({ path: '.env.local' });

function readArg(name: string, fallback: string): string {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return fallback;
  }

  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : fallback;
}

async function main() {
  const pilotId = readArg('pilotId', 'pilot-ks-live-2026-03-18');
  const tenantId = readArg('tenantId', 'tenant_ks');
  const start = new Date(readArg('start', '2026-03-18'));
  const end = new Date(readArg('end', '2026-03-25'));

  console.log('--- Week-1 SLA Rollup Aggregate Query ---');
  console.log(`Pilot ID: ${pilotId}`);
  console.log(`Tenant ID: ${tenantId}`);
  console.log(`Window: ${start.toISOString()} -> ${end.toISOString()}`);

  const { db } = await import('@interdomestik/database');

  const pilotClaims = await db.query.claims.findMany({
    with: {
      messages: true,
      stageHistory: true,
    },
  });

  const result = computePilotWeekRollup({
    claims: pilotClaims,
    end,
    start,
    tenantId,
  });

  console.log(`\n--- [General Cohort Rollup] ---`);
  console.log(`Total pilot claims in cohort: ${result.totalClaims}`);
  console.log(`Submitted claims (SLA Denominator): ${result.submittedClaims}`);

  console.log(`\n--- [SLA Performance] ---`);
  console.log(`Triage Breaches found: ${result.triage.breaches}`);
  console.log(`Public Update Breaches found: ${result.publicUpdate.breaches}`);

  console.log(`\n--- [Weekly Ratios] ---`);
  console.log(
    `Triage SLA: ${result.triage.numerator} / ${result.triage.denominator} (${result.triage.ratio})`
  );
  console.log(
    `Update SLA: ${result.publicUpdate.numerator} / ${result.publicUpdate.denominator} (${result.publicUpdate.ratio})`
  );
  console.log(
    `2 Operating-Day Progression: ${result.progression.numerator} / ${result.progression.denominator} (${result.progression.ratio})`
  );
  console.log(`Claims missing triage evidence: ${result.triage.missingEvidence}`);
  console.log(`Claims missing public update evidence: ${result.publicUpdate.missingEvidence}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
