import { fetchVercelAttestation } from '../fetch-vercel-attestation.mjs';
import { DEPLOY_HOST, DEPLOY_ID, HOSTS } from './context.mjs';

async function providerJson(path, { VERCEL_TOKEN, VERCEL_ORG_ID }, fetchImpl) {
  if (!VERCEL_TOKEN || !VERCEL_ORG_ID) throw new Error('DEPLOYMENT_AUTHORITY_MISSING');
  const endpoint = new URL(path, 'https://api.vercel.com');
  endpoint.searchParams.set('teamId', VERCEL_ORG_ID);
  const response = await fetchImpl(endpoint, {
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
    headers: { authorization: `Bearer ${VERCEL_TOKEN}` },
  });
  if (!response.ok) throw new Error('DEPLOYMENT_PROVIDER_REFUSED');
  return response.json();
}

export async function verifyDeployment(
  release,
  { env = process.env, fetchImpl = fetch, fetchAttestation = fetchVercelAttestation } = {}
) {
  const { manifest, hostname, vercelOutputDigest } = release;
  const canonical = HOSTS[manifest.environment];
  if (!canonical || !DEPLOY_HOST.test(hostname ?? '') || !env.VERCEL_PROJECT_ID)
    throw new Error('DEPLOYMENT_IDENTITY_INVALID');
  const deployment = await providerJson(`/v13/deployments/${hostname}`, env, fetchImpl);
  if (
    !DEPLOY_ID.test(deployment?.id ?? '') ||
    (release.deploymentId && deployment.id !== release.deploymentId) ||
    deployment.url !== hostname ||
    deployment.projectId !== env.VERCEL_PROJECT_ID ||
    (deployment.teamId || deployment.team?.id) !== env.VERCEL_ORG_ID ||
    deployment.readyState !== 'READY'
  )
    throw new Error('IMMUTABLE_DEPLOYMENT_MISMATCH');
  const metadata = JSON.parse(
    await fetchAttestation({
      metadataUrl: `https://${hostname}/.well-known/interdomestik-release-attestation.json`,
      expectedHost: hostname,
      bypassSecret: env.VERCEL_AUTOMATION_BYPASS_SECRET,
    })
  );
  if (
    metadata.environment !== manifest.environment ||
    metadata.commitSha !== manifest.commitSha ||
    metadata.sourceImageDigest !== manifest.imageDigest ||
    metadata.vercelOutputDigest !== vercelOutputDigest ||
    !/^sha256:[a-f0-9]{64}$/u.test(vercelOutputDigest ?? '')
  )
    throw new Error('DEPLOYMENT_ATTESTATION_MISMATCH');
  const alias = await providerJson(`/v4/aliases/${canonical}`, env, fetchImpl);
  if (
    alias?.alias !== canonical ||
    alias.redirect ||
    alias.projectId !== deployment.projectId ||
    alias.deploymentId !== deployment.id
  )
    throw new Error('CANONICAL_ALIAS_MISMATCH');
  return deployment.id;
}
