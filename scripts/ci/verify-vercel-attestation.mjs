const metadata = JSON.parse(process.env.METADATA ?? '{}');

function assertField(field, expected, label) {
  if (metadata[field] !== expected) {
    throw new Error(
      `Deployment ${label} metadata mismatch: expected ${expected}, got ${metadata[field] ?? 'missing'}`
    );
  }
}

assertField('commitSha', process.env.COMMIT_SHA, 'commit');
assertField('sourceImageDigest', process.env.ATTESTED_IMAGE_DIGEST, 'image digest');
assertField('vercelOutputDigest', process.env.VERCEL_OUTPUT_DIGEST, 'Vercel output digest');
