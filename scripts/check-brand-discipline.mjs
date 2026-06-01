import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BANNED_BRAND_FRAMINGS,
  CHECKED_SURFACES,
  REQUIRED_PROTECTIVE_MESSAGES,
} from './brand-discipline-policy.mjs';
const JSON_EXT = '.json';

function walkFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'coverage') {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, files);
    if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function checkedFiles(root) {
  const relFiles = new Set();
  for (const surface of CHECKED_SURFACES) {
    for (const relPath of surface.files ?? []) relFiles.add(relPath);
    for (const relRoot of surface.roots ?? []) {
      for (const filePath of walkFiles(path.join(root, relRoot))) {
        if (path.extname(filePath) === JSON_EXT)
          relFiles.add(path.relative(root, filePath).replaceAll(path.sep, '/'));
      }
    }
  }
  return [...relFiles].sort((left, right) => left.localeCompare(right));
}

function collectJsonStrings(value, prefix = '') {
  if (typeof value === 'string') return [{ path: prefix || '<root>', value }];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectJsonStrings(item, `${prefix}.${index}`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) =>
      collectJsonStrings(child, prefix ? `${prefix}.${key}` : key)
    );
  }
  return [];
}

function textEntries(root, relPath) {
  const absolutePath = path.join(root, relPath);
  if (!fs.existsSync(absolutePath)) return [];
  const source = fs.readFileSync(absolutePath, 'utf8');
  if (path.extname(relPath) !== JSON_EXT) {
    return source.split('\n').map((value, index) => ({ path: `line ${index + 1}`, value }));
  }
  return collectJsonStrings(JSON.parse(source));
}

function findBannedFramings(root) {
  const findings = [];
  for (const relPath of checkedFiles(root)) {
    for (const entry of textEntries(root, relPath)) {
      for (const banned of BANNED_BRAND_FRAMINGS) {
        if (banned.pattern.test(entry.value)) {
          findings.push([relPath, banned.label, entry.path, entry.value]);
        }
      }
    }
  }
  return findings;
}

function valueAtPath(value, dottedPath) {
  return dottedPath.split('.').reduce((current, segment) => {
    if (current == null) return undefined;
    return Array.isArray(current) ? current[Number(segment)] : current[segment];
  }, value);
}

function findMissingProtectiveMessages(root) {
  const findings = [];
  for (const requirement of REQUIRED_PROTECTIVE_MESSAGES) {
    for (const relPath of requirement.files) {
      const absolutePath = path.join(root, relPath);
      const document = fs.existsSync(absolutePath)
        ? JSON.parse(fs.readFileSync(absolutePath, 'utf8'))
        : null;
      const value = document ? valueAtPath(document, requirement.path) : undefined;
      if (typeof value !== 'string' || value.trim().length < 24) {
        findings.push({ file: relPath, path: requirement.path, surface: requirement.surface });
      }
    }
  }
  return findings;
}
export function runBrandDisciplineGuard(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const bannedFramings = findBannedFramings(root);
  const missingProtectiveMessages = findMissingProtectiveMessages(root);

  if (bannedFramings.length === 0 && missingProtectiveMessages.length === 0) {
    console.log('Brand discipline guard passed: checked copy stays explicit and protective.');
    return 0;
  }

  if (bannedFramings.length > 0) {
    console.error('Brand discipline guard failed: banned brand/compliance framing found.');
    for (const finding of bannedFramings) {
      console.error(`- ${finding[0]}:${finding[2]} ${finding[1]}: ${finding[3]}`);
    }
  }
  if (missingProtectiveMessages.length > 0) {
    console.error('Brand discipline guard failed: required protective message is missing.');
    for (const finding of missingProtectiveMessages) {
      console.error(`- ${finding.file}:${finding.path} (${finding.surface})`);
    }
  }
  return 1;
}
function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--root=')) options.root = arg.slice('--root='.length);
    else if (arg === '--root') {
      const root = argv[index + 1];
      if (!root || root.startsWith('-')) throw new Error('Missing value for --root');
      options.root = root;
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/check-brand-discipline.mjs [--root <repo>]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    process.exitCode = runBrandDisciplineGuard(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
