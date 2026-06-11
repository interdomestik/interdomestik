#!/usr/bin/env node
// Golden Loop bounded evidence packets: run a command (or read a file) and
// store head+tail-truncated output with exit code, sizes, and sha256 so full
// output is re-derivable. Prevents unbounded logs in reviews/PRs/state.
// Usage:
//   node scripts/golden-loop/evidence-packet.mjs --slice <id> --name <gate> \
//     [--root tmp/golden-loop] [--budget 16384] (--command "pnpm lint" | --file <path>)
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function argValue(args, name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
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
  const dir = path.join(root, sliceId, 'evidence');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${packet.name.replace(/[^\w.-]+/g, '_')}.packet.json`);
  fs.writeFileSync(file, `${JSON.stringify(packet, null, 2)}\n`);
  const index = path.join(dir, 'index.jsonl');
  const { output: _omit, ...summary } = packet;
  fs.appendFileSync(index, `${JSON.stringify({ ...summary, file })}\n`);
  return file;
}

function main() {
  const args = process.argv.slice(2);
  const sliceId = argValue(args, '--slice');
  const name = argValue(args, '--name');
  const root = argValue(args, '--root', process.env.GOLDEN_LOOP_EVIDENCE_ROOT || 'tmp/golden-loop');
  const byteBudget = Number(argValue(args, '--budget', '16384'));
  const command = argValue(args, '--command');
  const file = argValue(args, '--file');
  if (!sliceId || !name || (!command && !file)) {
    console.error('evidence-packet: usage: --slice <id> --name <n> (--command <cmd> | --file <path>)');
    process.exit(1);
  }
  let output = '';
  let exitCode = 0;
  let source = '';
  if (command) {
    source = command;
    const result = spawnSync('/bin/sh', ['-c', command], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    output = `${result.stdout || ''}${result.stderr || ''}`;
    exitCode = result.status ?? -1;
  } else {
    source = file;
    output = fs.readFileSync(file, 'utf8');
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
