#!/usr/bin/env node
// Golden Loop bounded evidence packets: run a command (or read a file) and
// store head+tail-truncated output with exit code, sizes, and sha256 so full
// output is re-derivable. Prevents unbounded logs in reviews/PRs/state.
// Usage:
//   node scripts/golden-loop/evidence-packet.mjs --slice <id> --name <gate> \
//     [--root tmp/golden-loop] [--budget 16384] (--gate <known-gate> | --file <path>)
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';
import { safeJoin, safeName, safeReadText, safeRoot } from './safe-paths.mjs';

function argValue(args, name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function gateCommand(gate) {
  if (gate === 'docs-verify') return ['pnpm', ['docs:verify']];
  if (gate === 'modularity') return ['pnpm', ['check:modularity-guard']];
  if (gate === 'plan-audit') return ['pnpm', ['plan:audit']];
  if (gate === 'repo-size') return ['pnpm', ['repo:size:check']];
  if (gate === 'security-guard') return ['pnpm', ['security:guard']];
  if (gate === 'track-audit') return ['pnpm', ['track:audit']];
  return null;
}

export function parseByteBudget(raw) {
  const budget = Number(raw);
  if (!Number.isInteger(budget) || budget < 1024 || budget > 1024 * 1024) {
    throw new Error('budget must be an integer from 1024 to 1048576 bytes');
  }
  return budget;
}

export function boundOutput(text, byteBudget) {
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.length <= byteBudget) {
    return { bounded: text, truncated: false, totalBytes: buffer.length };
  }
  const half = Math.floor(byteBudget / 2);
  const head = buffer.subarray(0, half).toString('utf8');
  const tail = buffer.subarray(buffer.length - half).toString('utf8');
  const omitted = buffer.length - 2 * half;
  return {
    bounded: `${head}\n…[evidence-packet: ${omitted} bytes omitted]…\n${tail}`,
    truncated: true,
    totalBytes: buffer.length,
  };
}

export function buildPacket({ name, source, output, exitCode, byteBudget }) {
  const { bounded, truncated, totalBytes } = boundOutput(output, byteBudget);
  return {
    packetVersion: 1,
    name,
    source,
    exitCode,
    totalBytes,
    truncated,
    sha256: createHash('sha256').update(output).digest('hex'),
    capturedAt: new Date().toISOString(),
    output: bounded,
  };
}

export function writePacket(root, sliceId, packet) {
  const dir = safeJoin(root, safeName(sliceId, 'slice'), 'evidence');
  fs.mkdirSync(dir, { recursive: true });
  const packetName = safeName(packet.name.replace(/[^\w.-]+/g, '_'), 'packet name');
  const file = safeJoin(dir, `${packetName}.packet.json`);
  fs.writeFileSync(file, `${JSON.stringify(packet, null, 2)}\n`);
  const index = safeJoin(dir, 'index.jsonl');
  const summary = { ...packet };
  delete summary.output;
  fs.appendFileSync(index, `${JSON.stringify({ ...summary, file })}\n`);
  return file;
}

function main() {
  const args = process.argv.slice(2);
  const sliceId = safeName(argValue(args, '--slice'), 'slice');
  const name = safeName(argValue(args, '--name'), 'name');
  const root = safeRoot(argValue(args, '--root', process.env.GOLDEN_LOOP_EVIDENCE_ROOT));
  const byteBudget = parseByteBudget(argValue(args, '--budget', '16384'));
  const gate = argValue(args, '--gate');
  const file = argValue(args, '--file');
  if (!sliceId || !name || (!gate && !file)) {
    console.error(
      'evidence-packet: usage: --slice <id> --name <n> (--gate <gate> | --file <path>)'
    );
    process.exit(1);
  }
  let output = '';
  let exitCode = 0;
  let source = '';
  if (gate) {
    const commandSpec = gateCommand(gate);
    if (!commandSpec) throw new Error(`unknown evidence gate: ${gate}`);
    const [gateBin, gateArgs] = commandSpec;
    source = `${gateBin} ${gateArgs.join(' ')}`;
    const result = spawnSync(gateBin, gateArgs, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      shell: false,
    });
    output = `${result.stdout || ''}${result.stderr || ''}`;
    exitCode = result.status ?? -1;
  } else {
    source = file;
    output = safeReadText(file);
  }
  const packet = buildPacket({ name, source, output, exitCode, byteBudget });
  const written = writePacket(root, sliceId, packet);
  console.log(
    JSON.stringify(
      { file: written, exitCode, totalBytes: packet.totalBytes, truncated: packet.truncated },
      null,
      2
    )
  );
  process.exit(exitCode === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
