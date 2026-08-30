#!/usr/bin/env node
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson, must, readBoundedRegularText } from './slice-rehearse-canonical.mjs';
import { summarizeTelemetryV2 } from './slice-telemetry-v2-aggregation.mjs';

export { summarizeTelemetryV2 } from './slice-telemetry-v2-aggregation.mjs';
export { TELEMETRY_V2_PHASES, validateTelemetryEventV2 } from './slice-telemetry-v2-schema.mjs';

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    must(process.argv.length === 4 && process.argv[2] === '--input', 'usage: --input <path>');
    const text = readBoundedRegularText(resolve(process.cwd(), process.argv[3]), {
      label: 'Telemetry v2 input',
      maxBytes: 16 * 1024 * 1024,
      allowedRoots: [process.cwd(), tmpdir(), '/private/tmp'],
    });
    must(text.endsWith('\n') && !text.includes('\n\n'), 'telemetry v2 JSONL framing is invalid');
    const lines = text
      .trimEnd()
      .split('\n')
      .map(line => JSON.parse(line));
    process.stdout.write(canonicalJson(summarizeTelemetryV2(lines)));
  } catch (error) {
    process.stderr.write(`slice telemetry v2 input is invalid: ${error.message}\n`);
    process.exitCode = 1;
  }
}
