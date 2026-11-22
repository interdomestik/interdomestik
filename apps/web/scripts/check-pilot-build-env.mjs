import { createRequire } from 'node:module';
import { require as requireTypeScript } from 'tsx/cjs/api';

// Use the env loader installed with Next so the build and preflight see the same precedence.
const requireFromNext = createRequire(import.meta.resolve('next/package.json'));
const { loadEnvConfig } = requireFromNext('@next/env');
const { refusedPilotEnvNames } = requireTypeScript(
  '../src/lib/pilot-deployment-env.ts',
  import.meta.url
);
const { hasPositiveProductionSignal } = requireTypeScript(
  '../src/lib/runtime-environment.ts',
  import.meta.url
);

process.env.NODE_ENV ||= 'production';
process.env.NEXT_RUNTIME = 'nodejs';
const { combinedEnv } = loadEnvConfig(process.cwd(), false, {
  info() {},
  error() {
    throw new Error('Could not load the Next.js build environment.');
  },
});
const refused = refusedPilotEnvNames(combinedEnv);
process.stdout.write(JSON.stringify(refused.filter(name => name.startsWith('NEXT_PUBLIC_'))));

if (hasPositiveProductionSignal(combinedEnv) && refused.length > 0) {
  console.error(`Production build refuses ${refused.join(', ')}`);
  process.exitCode = 1;
}
