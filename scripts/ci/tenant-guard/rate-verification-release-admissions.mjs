// WP-07 PR-1c uses a guarded loopback/confirmed-CI connection.
// The exact CLI entry binds one release operation to the two reviewed transaction paths.
const writer = 'packages/database/src/scripts/rate-verification-limit.ts';
const cli = 'packages/database/src/scripts/set-rate-verification-limit.ts';
const bindTenant = `${writer}#bindReleaseTenant`;

export const RATE_VERIFICATION_RELEASE_CONTRACT = {
  file: writer,
  unit: 'bindReleaseTenant',
  kinds: { 'connection-control': 3 },
  sha256: '02680bed32a5e7855dc0068b25145b3c45fbbda31f99e6ec52c7fd01c0ec1de3',
  reason:
    'The private release writer verifies that both login and active roles are subject to RLS, ' +
    'then enables local row security and binds both tenant GUCs to the explicit release tenant.',
};

export const RATE_VERIFICATION_RELEASE_ADMISSION = {
  id: 'wp07-pr1c-rate-verification-release',
  reason:
    'The guarded CLI directly calls the writer or read-only receipt lookup for one explicit ' +
    'tenant. Only these transactions may call the contracted release tenant binder.',
  files: [
    {
      file: writer,
      sha256: '3a1a293f2155678aae5c591389e371b4bd74a83bacba02beff854b4a380ac5d3',
      units: ['setRateVerificationLimit', 'checkRateVerificationLimitReceipt'],
    },
    {
      file: cli,
      sha256: '88f71652793327426c382fb73c4edabba66acdb39afb69c1a675aa388094c7f0',
      units: ['main'],
    },
  ],
  sinkEdges: [
    { file: writer, unit: 'setRateVerificationLimit', sink: bindTenant },
    { file: writer, unit: 'checkRateVerificationLimitReceipt', sink: bindTenant },
    { file: cli, unit: 'main', sink: `${writer}#setRateVerificationLimit` },
    { file: cli, unit: 'main', sink: `${writer}#checkRateVerificationLimitReceipt` },
  ],
};
