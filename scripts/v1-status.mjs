#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_TRACKER = 'docs/plans/2026-02-22-v1-bulletproof-tracker.md';
const trackerPath = path.resolve(process.cwd(), process.argv[2] || DEFAULT_TRACKER);

if (!fs.existsSync(trackerPath)) {
  console.error(`Tracker not found: ${trackerPath}`);
  process.exit(1);
}

const text = fs.readFileSync(trackerPath, 'utf8');
const lines = text.split(/\r?\n/);

const getValue = prefix => {
  const line = lines.find(l => l.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : 'n/a';
};

let section = 'General';
const items = [];
for (const line of lines) {
  const sectionMatch = line.match(/^###\s+(.+)$/);
  if (sectionMatch) {
    section = sectionMatch[1].trim();
    continue;
  }

  const taskMatch = line.match(/^- \[( |x)\] ([A-Za-z0-9.-]+) - (.+)$/);
  if (taskMatch) {
    const done = taskMatch[1] === 'x';
    const id = taskMatch[2];
    const title = taskMatch[3].split(' | ')[0].trim();
    items.push({ done, id, title, section });
  }
}

const actionItems = items.filter(item => /^A\d+/.test(item.id));
const doneActions = actionItems.filter(item => item.done);
const openActions = actionItems.filter(item => !item.done);
const nextActions = openActions.slice(0, 8);

console.log('=== Interdomestik v1.0.0 Bulletproof Status ===');
console.log(`Tracker: ${trackerPath}`);
console.log(`Last updated: ${getValue('Last updated:')}`);
console.log(`Current phase: ${getValue('Current phase:')}`);
console.log(`Actions complete: ${doneActions.length}/${actionItems.length}`);
console.log(`Actions open: ${openActions.length}`);

if (nextActions.length > 0) {
  console.log('\nNext actions:');
  for (const action of nextActions) {
    console.log(`- ${action.id} [${action.section}] ${action.title}`);
  }
} else {
  console.log('\nAll milestone actions are complete.');
}

console.log('\nOpen tracker: docs/plans/2026-02-22-v1-bulletproof-tracker.md');
console.log('Program plan: docs/plans/2026-02-22-v1-bulletproof-program.md');
