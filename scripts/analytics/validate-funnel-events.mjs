#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_EVENTS = new Set([
  'funnel_landing_viewed',
  'funnel_activation_completed',
  'funnel_first_claim_submitted',
  'retention_pulse',
]);

function parseArgs(argv) {
  const args = {
    input: '',
    report: path.resolve(process.cwd(), 'tmp/analytics/funnel-validation-report.json'),
    minContextRatio: 0.99,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--input') {
      args.input = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (token === '--report') {
      args.report = argv[index + 1] ?? args.report;
      index += 1;
      continue;
    }
    if (token === '--min-context-ratio') {
      const parsed = Number(argv[index + 1] ?? '');
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        throw new Error(`Invalid --min-context-ratio: "${argv[index + 1]}"`);
      }
      args.minContextRatio = parsed;
      index += 1;
      continue;
    }
  }

  if (!args.input) {
    throw new Error('Missing required --input <path> argument');
  }

  return args;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasContext(properties) {
  if (!properties || typeof properties !== 'object') {
    return false;
  }

  return isNonEmptyString(properties.tenant_id) && isNonEmptyString(properties.variant);
}

function readEvents(inputPath) {
  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (Array.isArray(raw)) {
    return raw;
  }
  if (raw && typeof raw === 'object' && Array.isArray(raw.events)) {
    return raw.events;
  }
  throw new Error('Input must be an array of events or an object with an events array');
}

function toNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function validateFunnelContext(events, minContextRatio) {
  const eventStats = {};
  let totalFunnelEvents = 0;
  let withFullContext = 0;

  for (const event of events) {
    const eventName = typeof event?.event === 'string' ? event.event : null;
    if (!eventName || !REQUIRED_EVENTS.has(eventName)) {
      continue;
    }

    totalFunnelEvents += 1;
    const properties =
      event && typeof event === 'object' && event.properties && typeof event.properties === 'object'
        ? event.properties
        : {};
    const contextOk = hasContext(properties);
    if (contextOk) {
      withFullContext += 1;
    }

    if (!eventStats[eventName]) {
      eventStats[eventName] = { total: 0, with_context: 0 };
    }
    eventStats[eventName].total += 1;
    if (contextOk) {
      eventStats[eventName].with_context += 1;
    }
  }

  const contextRatio = totalFunnelEvents === 0 ? 1 : withFullContext / totalFunnelEvents;
  const passed = contextRatio >= minContextRatio;

  return {
    passed,
    threshold: minContextRatio,
    totals: {
      funnel_events: totalFunnelEvents,
      with_context: withFullContext,
      context_ratio: Number(contextRatio.toFixed(6)),
    },
    events: Object.fromEntries(
      Object.entries(eventStats).map(([name, stats]) => {
        const total = toNumber(stats.total);
        const withContext = toNumber(stats.with_context);
        const ratio = total === 0 ? 1 : withContext / total;
        return [
          name,
          {
            total,
            with_context: withContext,
            context_ratio: Number(ratio.toFixed(6)),
          },
        ];
      })
    ),
  };
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const inputPath = path.resolve(process.cwd(), args.input);
    const reportPath = path.resolve(process.cwd(), args.report);
    const events = readEvents(inputPath);
    const result = validateFunnelContext(events, args.minContextRatio);

    const report = {
      generated_at: new Date().toISOString(),
      input: path.relative(process.cwd(), inputPath),
      ...result,
    };

    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    console.log(
      `[analytics] funnel context coverage ${report.totals.with_context}/${report.totals.funnel_events} (${report.totals.context_ratio})`
    );
    console.log(
      `[analytics] threshold ${report.threshold} => ${report.passed ? 'PASS' : 'FAIL'} | report: ${path.relative(process.cwd(), reportPath)}`
    );

    process.exit(report.passed ? 0 : 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[analytics] validation failed: ${message}`);
    process.exit(1);
  }
}

main();
