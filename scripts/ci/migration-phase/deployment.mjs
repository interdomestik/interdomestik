import { fetchVercelAttestation } from '../fetch-vercel-attestation.mjs';

const HOSTS = {
  staging: 'staging.interdomestik.com',
  production: 'www.interdomestik.com',
  scratch: 'staging.interdomestik.com',
};

async function providerJson(path, { teamId }, token) {
  const endpoint = new URL(path, 'https://api.vercel.com');
  endpoint.searchParams.set('teamId', teamId);
  const response = await fetch(endpoint, {
    redirect: 'error',
    signal: AbortSignal.timeout(7_000),
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('DEPLOYMENT_PROVIDER_REFUSED');
  return response.json();
}

export async function verifyDeployment(expected, manifest, config, fixture) {
  const canonical = HOSTS[config.environment];
  const token = process.env.VERCEL_TOKEN;
  if (!fixture && !token) throw new Error('DEPLOYMENT_AUTHORITY_MISSING');
  const deployment = fixture
    ? fixture.deployment
    : await providerJson(`/v13/deployments/${expected.id}`, config, token);
  if (
    deployment?.id !== expected.id ||
    deployment.url !== expected.hostname ||
    deployment.projectId !== config.projectId ||
    (deployment.teamId ?? deployment.team?.id) !== config.teamId ||
    deployment.readyState !== 'READY'
  )
    throw new Error('IMMUTABLE_DEPLOYMENT_MISMATCH');

  const deadline = AbortSignal.timeout(7_000);
  const metadata = fixture
    ? fixture.metadata
    : JSON.parse(
        await fetchVercelAttestation({
          metadataUrl: `https://${expected.hostname}/.well-known/interdomestik-release-attestation.json`,
          expectedHost: expected.hostname,
          maxRedirects: 0,
          fetchImpl: (url, options) => fetch(url, { ...options, signal: deadline }),
        })
      );
  if (
    metadata?.environment !== manifest.environment ||
    metadata.commitSha !== manifest.commitSha ||
    metadata.sourceImageDigest !== expected.imageDigest ||
    metadata.vercelOutputDigest !== expected.buildDigest
  )
    throw new Error('DEPLOYMENT_ATTESTATION_MISMATCH');

  const alias = fixture
    ? fixture.alias
    : await providerJson(`/v4/aliases/${canonical}`, config, token);
  if (
    alias?.alias !== canonical ||
    alias.redirect ||
    alias.deletedAt != null ||
    alias.projectId !== config.projectId ||
    alias.deploymentId !== deployment.id ||
    alias.uid !== expected.aliasUid ||
    alias.updatedAt !== expected.aliasUpdatedAt
  )
    throw new Error('CANONICAL_ALIAS_MISMATCH');
}
