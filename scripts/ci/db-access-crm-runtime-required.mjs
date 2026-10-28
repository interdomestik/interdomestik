import fs from 'node:fs';
import path from 'node:path';
import { runCrmRuntime } from './db-access-crm-runtime.mjs';
import { joinFreshCrmProof } from './db-access-crm-proof-join.mjs';
import { evaluateGuard } from './db-access-evaluator.mjs';
import { exact, hash, refuse } from './db-access-provider-runtime-identity.mjs';

export function crmCandidateRecords(policy, producer) {
  const patches = {};
  if (policy.crmProof) {
    const file = 'scripts/ci/db-access-crm-runtime-lock.json';
    const lock = JSON.parse(exact(producer, file, policy.producerFiles[file]));
    if (Object.keys(lock.packageFiles ?? {}).length !== 3) refuse('CRM patch shard closure');
    for (const [shard, expected] of Object.entries(lock.packageFiles)) {
      if (!/^scripts\/ci\/db-access-crm-runtime-packages-[123]\.json$/u.test(shard))
        refuse('CRM patch shard path');
      const packages = JSON.parse(exact(producer, shard, expected));
      for (const entry of Object.values(packages)) {
        if (!entry.patch) continue;
        const { file: patchFile, sha256, bytes, mode } = entry.patch;
        const record = { sha256, bytes, mode };
        if (patches[patchFile] && JSON.stringify(patches[patchFile]) !== JSON.stringify(record))
          refuse('conflicting CRM patch identity');
        patches[patchFile] = record;
      }
    }
  }
  return {
    ...policy.crmProof?.sources,
    ...policy.crmProof?.runtime?.files,
    ...policy.crmProof?.runtime?.configuration?.files,
    ...policy.crmProof?.runtime?.migrations,
    ...patches,
  };
}

// Called inside the fixed producer's authenticated, source-bookended interval.
export function executeCrmRuntime(input) {
  return input.policy.crmProof ? runCrmRuntime(input) : undefined;
}

export function executeCrmProof(input) {
  if (!input.policy.crmProof) return undefined;
  const runtime = executeCrmRuntime(input);
  const report = evaluateGuard(input.candidate);
  return { runtime, report };
}

// Caller completes final Git authentication and source snapshots before this join.
export function attachCrmJoin({ crm, context, policy, receipt, output }) {
  if (!policy.crmProof) return;
  const join = joinFreshCrmProof({
    context,
    policy,
    runtime: crm.runtime,
    provider: receipt,
    report: crm.report,
  });
  receipt.crmRuntime = crm.runtime;
  receipt.crmJoin = join;
  receipt.crmStaticReportSha256 = hash(JSON.stringify(crm.report));
  fs.writeFileSync(path.join(output, 'crm-static-report.json'), JSON.stringify(crm.report));
}
