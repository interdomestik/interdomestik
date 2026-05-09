import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const guardScript = path.join(repoRoot, 'scripts/check-signed-url-exposure.mjs');

function makeTempRepo() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'interdomestik-signed-url-'));
  fs.mkdirSync(path.join(tempRoot, 'apps/web/src/app/api/documents/[id]'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(tempRoot, 'apps/web/src/app/api/uploads'), { recursive: true });
  return tempRoot;
}

function runGuard(root) {
  return spawnSync(process.execPath, [guardScript, `--root=${root}`], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

test('signed URL exposure guard blocks signed URL logging', () => {
  const tempRoot = makeTempRepo();
  const routePath = path.join(tempRoot, 'apps/web/src/app/api/documents/[id]/route.ts');
  fs.writeFileSync(routePath, 'console.error("failed", { signedUrl: data.signedUrl });\n', 'utf8');

  const failed = runGuard(tempRoot);
  assert.equal(failed.status, 1, failed.stderr);
  assert.match(failed.stderr, /signed URL value may be logged/);
});

test('signed URL exposure guard requires signed URL response headers on known routes', () => {
  const tempRoot = makeTempRepo();
  const routePath = path.join(tempRoot, 'apps/web/src/app/api/uploads/route.ts');
  fs.writeFileSync(
    routePath,
    'export function POST() { return NextResponse.json(result.body); }\n',
    'utf8'
  );

  const failed = runGuard(tempRoot);
  assert.equal(failed.status, 1, failed.stderr);
  assert.match(failed.stderr, /no-store and no-referrer/);
});

test('signed URL exposure guard blocks URL-bearing anchors without noreferrer', () => {
  const tempRoot = makeTempRepo();
  const componentPath = path.join(tempRoot, 'apps/web/src/components/Documents.tsx');
  fs.mkdirSync(path.dirname(componentPath), { recursive: true });
  fs.writeFileSync(componentPath, '<a href={doc.url} target="_blank">View</a>\n', 'utf8');

  const failed = runGuard(tempRoot);
  assert.equal(failed.status, 1, failed.stderr);
  assert.match(failed.stderr, /noreferrer semantics/);
});

test('signed URL exposure guard permits bounded headers and noreferrer links', () => {
  const tempRoot = makeTempRepo();
  fs.writeFileSync(
    path.join(tempRoot, 'apps/web/src/app/api/documents/[id]/route.ts'),
    "import { signedUrlResponseInit } from '@/lib/storage/signed-url-exposure';\n" +
      'export function GET() { return NextResponse.json(body, signedUrlResponseInit()); }\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(tempRoot, 'apps/web/src/app/api/uploads/route.ts'),
    "import { signedUrlResponseInit } from '@/lib/storage/signed-url-exposure';\n" +
      'export function POST() { return NextResponse.json(result.body, signedUrlResponseInit()); }\n',
    'utf8'
  );
  const componentPath = path.join(tempRoot, 'apps/web/src/components/Documents.tsx');
  fs.mkdirSync(path.dirname(componentPath), { recursive: true });
  fs.writeFileSync(
    componentPath,
    '<a href={doc.url} target="_blank" rel="noopener noreferrer">View</a>\n',
    'utf8'
  );

  const passed = runGuard(tempRoot);
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /Signed URL exposure guard passed/);
});
