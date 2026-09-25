import { fetchVercelAttestation } from './fetch-vercel-attestation.mjs';

export async function readStagingDeploymentIdentity(
  hostname,
  attestationImpl = fetchVercelAttestation
) {
  const metadata = JSON.parse(
    await attestationImpl({
      metadataUrl: `https://${hostname}/.well-known/interdomestik-release-attestation.json`,
      expectedHost: hostname,
    })
  );
  if (
    metadata.environment !== 'staging' ||
    !/^[a-f0-9]{40}$/u.test(metadata.commitSha || '') ||
    !/^sha256:[a-f0-9]{64}$/u.test(metadata.sourceImageDigest || '') ||
    !/^sha256:[a-f0-9]{64}$/u.test(metadata.vercelOutputDigest || '')
  )
    throw new Error('Invalid immutable staging release metadata');
  return metadata.commitSha;
}
