import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Command from './command';
import { readPlan } from './fixture-plan';
import { cacheWitness } from './cache-probe';
import { runAdminAssignment, runAgentAssignment, runStaffAssignment } from './actions';

export default async function Scenario({ params, area }) {
  await headers(); // Real request-time context; never run a probe during build prerendering.
  const { locale, claimId } = await params;
  const plan = readPlan();
  const scenario = plan.scenarios.find(
    row =>
      row.claimId === claimId && (row.profile === 'staff' ? area === 'staff' : area === 'admin')
  );
  if (!['sq', 'en', 'sr', 'mk'].includes(locale) || !scenario) notFound();
  const value = await cacheWitness(plan.runId, scenario.profile, scenario.claimId);
  const action =
    scenario.profile === 'legacy-admin'
      ? runAdminAssignment
      : scenario.profile === 'legacy-agent'
        ? runAgentAssignment
        : runStaffAssignment;
  return (
    <>
      <h1>Compiled assignment qualification</h1>
      <p data-testid="fixture-profile">{scenario.profile}</p>
      <output data-testid="cache-witness" data-cache-token={value.token}>
        {JSON.stringify(value)}
      </output>
      <Command action={action} runId={plan.runId} scenario={scenario} />
    </>
  );
}
