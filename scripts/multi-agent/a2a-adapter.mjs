#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function ensureNonEmptyString(value, label) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`Missing required field: ${label}`);
  }
  return normalized;
}

function readJsonInput(filePath) {
  if (!filePath || filePath === '-') {
    const raw = fs.readFileSync(0, 'utf8');
    return JSON.parse(raw);
  }

  const absolutePath = path.resolve(filePath);
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function writeJsonOutput(payload, outputPath) {
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  if (!outputPath) {
    process.stdout.write(serialized);
    return;
  }
  const absolutePath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, serialized, 'utf8');
}

export function toA2ATaskEnvelope(input) {
  const taskId = ensureNonEmptyString(input.taskId, 'taskId');
  const objective = ensureNonEmptyString(input.objective, 'objective');
  const role = ensureNonEmptyString(input.role, 'role');
  const payload = input.payload ?? {};
  const metadata = input.metadata ?? {};
  const now = new Date().toISOString();

  return {
    protocol: 'a2a',
    version: '0.2-draft',
    task: {
      id: taskId,
      kind: 'execution',
      role,
      objective,
      status: 'submitted',
    },
    messages: [
      {
        id: `msg-${taskId}-1`,
        role: 'orchestrator',
        createdAt: now,
        content: [
          {
            type: 'text',
            text: objective,
          },
        ],
      },
    ],
    artifacts: [
      {
        type: 'json',
        mimeType: 'application/json',
        data: payload,
      },
    ],
    metadata,
  };
}

export function fromA2AResultEnvelope(envelope) {
  if (!envelope || envelope.protocol !== 'a2a') {
    throw new Error('Unsupported A2A envelope protocol');
  }

  return {
    taskId: envelope.task?.id ?? '',
    role: envelope.task?.role ?? 'unknown',
    status: envelope.task?.status ?? 'unknown',
    summary: envelope.task?.summary ?? '',
    artifacts: Array.isArray(envelope.artifacts)
      ? envelope.artifacts
          .map(artifact => artifact?.data)
          .filter(data => data !== undefined && data !== null)
      : [],
  };
}

function printHelp() {
  process.stdout.write(`a2a-adapter

Usage:
  node scripts/multi-agent/a2a-adapter.mjs --mode export-request --input request.json [--output a2a-request.json]
  node scripts/multi-agent/a2a-adapter.mjs --mode import-result --input a2a-result.json [--output internal-result.json]

Options:
  --mode <export-request|import-result>
  --input <path|->     Input JSON file path, or "-" for STDIN
  --output <path>      Optional output JSON file path (defaults to STDOUT)
  -h, --help           Show help
`);
}

function parseArgs(argv) {
  const parsed = {
    mode: '',
    input: '',
    output: '',
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '-h' || token === '--help') {
      parsed.help = true;
      continue;
    }
    if (token === '--mode' && next) {
      parsed.mode = next;
      i += 1;
      continue;
    }
    if (token === '--input' && next) {
      parsed.input = next;
      i += 1;
      continue;
    }
    if (token === '--output' && next) {
      parsed.output = next;
      i += 1;
      continue;
    }
  }
  return parsed;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!args.mode) {
    throw new Error('Missing required --mode');
  }

  if (!args.input) {
    throw new Error('Missing required --input');
  }

  if (args.mode === 'export-request') {
    const request = readJsonInput(args.input);
    const envelope = toA2ATaskEnvelope(request);
    writeJsonOutput(envelope, args.output);
    return;
  }

  if (args.mode === 'import-result') {
    const envelope = readJsonInput(args.input);
    const result = fromA2AResultEnvelope(envelope);
    writeJsonOutput(result, args.output);
    return;
  }

  throw new Error(`Unsupported mode: ${args.mode}`);
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[a2a-adapter] FAIL: ${error.message}\n`);
    process.exit(1);
  }
}
