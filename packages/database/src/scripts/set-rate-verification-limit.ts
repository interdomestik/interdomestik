import { parseArgs } from 'node:util';

import { withDisposableClient } from '../disposable-client';
import {
  checkRateVerificationLimitReceipt,
  setRateVerificationLimit,
} from './rate-verification-limit';
import { formatRateVerificationLimitFailure } from './rate-verification-limit-failure';

async function main() {
  const { values } = parseArgs({
    options: {
      tenant: { type: 'string' },
      'max-age-seconds': { type: 'string' },
      'operation-id': { type: 'string' },
      'approval-reference': { type: 'string' },
      'release-identity': { type: 'string' },
      'check-receipt': { type: 'boolean' },
    },
  });
  const {
    tenant: tenantId,
    'max-age-seconds': age,
    'operation-id': operationId,
    'approval-reference': approvalReference,
    'release-identity': releaseIdentity,
    'check-receipt': checkReceipt,
  } = values;
  if (!tenantId || !age || !operationId || !approvalReference || !releaseIdentity) {
    throw new Error('Missing rate verification limit arguments');
  }
  if (age !== 'null' && !/^\d+$/u.test(age)) throw new Error('Invalid max age');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Missing provisioning database URL');
  const operation = {
    tenantId,
    maxAgeSeconds: age === 'null' ? null : Number(age),
    operationId,
    approvalReference,
    releaseIdentity,
  };
  const receipt = await withDisposableClient(
    databaseUrl,
    { applicationName: 'wp07_set_rate_verification_limit' },
    async client =>
      checkReceipt
        ? checkRateVerificationLimitReceipt(client, operation)
        : setRateVerificationLimit(client, operation)
  );
  console.log(JSON.stringify(receipt));
}

main().catch((error: unknown) => {
  console.error(formatRateVerificationLimitFailure(error));
  process.exitCode = 1;
});
