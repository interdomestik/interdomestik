#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const PROGRAM_PATH = path.resolve(process.cwd(), 'docs/plans/current-program.md');
const TRACKER_PATH = path.resolve(process.cwd(), 'docs/plans/current-tracker.md');

function readFileOrFail(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`plan:status failed: missing ${filePath}`);
    process.exit(1);
  }

  return fs.readFileSync(filePath, 'utf8');
}

function extractSection(text, heading) {
  const normalizedHeading = `## ${heading}`;
  const startIndex = text.search(new RegExp(`^${normalizedHeading}\\r?$`, 'm'));

  if (startIndex === -1) {
    return 'n/a';
  }

  const afterHeadingIndex = text.indexOf('\n', startIndex);

  if (afterHeadingIndex === -1) {
    return 'n/a';
  }

  const remainder = text.slice(afterHeadingIndex + 1);
  const nextHeadingMatch = remainder.match(/^## .*/m);
  const endIndex = nextHeadingMatch?.index ?? remainder.length;

  return remainder.slice(0, endIndex).trim();
}

function extractQueueRows(text) {
  const section = extractSection(text, 'Active Queue');
  const lines = section.split(/\r?\n/);
  const rows = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed.startsWith('| `PG')) {
      continue;
    }

    const cells = trimmed
      .split('|')
      .slice(1, -1)
      .map(cell => cell.trim());

    if (cells.length < 5) {
      continue;
    }

    rows.push({
      id: cells[0].replaceAll('`', ''),
      status: cells[1].replaceAll('`', ''),
      owner: cells[2].replaceAll('`', ''),
      work: cells[3],
    });
  }

  return rows;
}

const program = readFileOrFail(PROGRAM_PATH);
const tracker = readFileOrFail(TRACKER_PATH);
const currentPhase = extractSection(program, 'Current Phase').replace(/\n+/g, ' ');
const goals = extractSection(program, 'Program Goals')
  .split(/\r?\n/)
  .filter(line => /^\d+\./.test(line.trim()))
  .map(line => line.trim().replace(/^\d+\.\s*/, ''));
const queue = extractQueueRows(tracker);

console.log('=== Interdomestik Current Program Status ===');
console.log(`Program: ${path.relative(process.cwd(), PROGRAM_PATH)}`);
console.log(`Tracker: ${path.relative(process.cwd(), TRACKER_PATH)}`);
console.log(`Current phase: ${currentPhase}`);

if (goals.length > 0) {
  console.log('\nProgram goals:');
  for (const goal of goals) {
    console.log(`- ${goal}`);
  }
}

if (queue.length > 0) {
  console.log('\nActive queue:');
  for (const item of queue) {
    console.log(`- ${item.id} [${item.status}] ${item.work} (owner: ${item.owner})`);
  }
}
