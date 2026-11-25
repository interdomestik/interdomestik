import { E2E_EMAIL_DOMAIN } from '../src/e2e-users';
import { cleanSeededLegalAcceptance, seedLegalAcceptance } from '../src/seed-golden/index';

type Identity = NonNullable<Parameters<typeof seedLegalAcceptance>[0]>[number];

const syntheticDomains = new Set(['example.test', E2E_EMAIL_DOMAIN]);

function isSyntheticEmail(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^[^@\s]+@([^@\s]+)$/u.exec(value);
  return match !== null && syntheticDomains.has(match[1] ?? '');
}

function isFixtureIdentity(value: unknown): value is Identity {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    'tenantId' in value &&
    typeof value.tenantId === 'string' &&
    value.tenantId.length > 0 &&
    'email' in value &&
    isSyntheticEmail(value.email) &&
    (!('legacyEmail' in value) || isSyntheticEmail(value.legacyEmail))
  );
}

async function main() {
  const [, , mode, raw] = process.argv;
  if (mode !== 'seed' && mode !== 'clean') throw new Error('Unknown fixture operation');
  const identities: unknown = JSON.parse(raw ?? 'null');
  if (!Array.isArray(identities) || !identities.length || !identities.every(isFixtureIdentity)) {
    throw new Error('Expected a non-empty list of synthetic fixture identities');
  }
  if (mode === 'seed') await seedLegalAcceptance(identities);
  else await cleanSeededLegalAcceptance(identities);
}

void main().catch((error: unknown) => {
  // Database errors can include connection details and SQL parameters.
  const targetRefused = error instanceof Error && error.message.startsWith('Seed target refused:');
  console.error(
    targetRefused
      ? 'Fixture database target refused'
      : 'Synthetic legal acceptance fixture operation failed'
  );
  process.exitCode = 1;
});
