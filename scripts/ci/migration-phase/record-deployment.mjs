import { output, readContext, readManifest, readRelease, writeEvidence } from './context.mjs';
import { verifyDeployment } from './deployment.mjs';
import { digest } from './proof.mjs';

try {
  const context = readContext();
  if (process.argv[2] === 'verify') {
    await verifyDeployment(readRelease(process.env.RELEASE_DEPLOYMENT, context));
  } else {
    const manifest = readManifest(process.env.RELEASE_MANIFEST, context);
    const candidate = {
      manifest,
      deploymentAttempt: context.attempt,
      hostname: process.env.RELEASE_DEPLOYMENT_HOST,
      vercelOutputDigest: process.env.RELEASE_VERCEL_OUTPUT_DIGEST,
    };
    const deploymentId = await verifyDeployment(candidate);
    const release = { ...candidate, deploymentId };
    writeEvidence({ release, manifestSha256: digest(JSON.stringify(manifest)) });
    output('release', JSON.stringify(release));
  }
} catch {
  process.stderr.write('RELEASE_DEPLOYMENT_VERIFICATION_FAILED\n');
  process.exitCode = 1;
}
