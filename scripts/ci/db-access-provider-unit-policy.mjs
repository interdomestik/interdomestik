import fs from 'node:fs';
import { loadCrmProofPolicy } from './db-access-crm-policy-loader.mjs';
import { loadMessageProofPolicy } from './db-access-message-policy-loader.mjs';
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
// Fixed G2 data beside immutable executable source. Candidate paths never select this artifact.
const policy = JSON.parse(
  fs.readFileSync(new URL('./db-access-provider-unit-policy.json', import.meta.url), 'utf8')
);
const messageProof = loadMessageProofPolicy(policy);
if (messageProof) policy.messageProof = messageProof;
const crmProof = loadCrmProofPolicy(policy);
if (crmProof) policy.crmProof = crmProof;
export const PROVIDER_UNIT_POLICY = freeze(policy);
