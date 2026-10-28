import { M4_PROOF_POLICY } from './db-access-m4-proof-policy.mjs';
import { refuse } from './db-access-provider-runtime-identity.mjs';

// Extend the existing runtime bookend without replacing another contract's identity.
export function bindM4CandidateRecords(candidateRecords, policy) {
  if (policy.m4Proof !== M4_PROOF_POLICY) refuse('M4 runtime records lack fixed producer policy');
  for (const [file, expected] of Object.entries(M4_PROOF_POLICY.sources)) {
    const prior = candidateRecords[file];
    if (prior && ['bytes', 'mode', 'sha256'].some(key => prior[key] !== expected[key]))
      refuse('M4 source overlaps a different existing proof input ' + file);
    candidateRecords[file] = expected;
  }
}
