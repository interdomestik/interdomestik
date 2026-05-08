import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const webRoot = path.join(repoRoot, 'apps/web');
const nextBin = path.join(webRoot, 'node_modules/next/dist/bin/next');
const appRoot = path.join(repoRoot, 'tmp/sec05-next-csp-nonce-triage/app');
const outputRoot = path.join(repoRoot, 'tmp/sec05-next-csp-nonce-triage');
const artifactRoot = path.join(outputRoot, 'artifacts');
const requireFromWeb = createRequire(path.join(webRoot, 'package.json'));

const nonce = 'c2VjMDUtY29uc3RhbnQtbm9uY2U=';
const reportUri = '/__sec05-csp-report';
const host = '127.0.0.1';
const preferredFirstPort = 43110;

const cases = [
  {
    id: 'A',
    description:
      'Documented baseline: nonce CSP request header and same nonce CSP response header.',
  },
  {
    id: 'B',
    description:
      'Repo-like report mode: nonce CSP request header, existing enforced CSP response header, and nonce Report-Only response header.',
  },
  {
    id: 'C',
    description:
      'Report-Only extraction probe: nonce CSP-Report-Only request header and nonce Report-Only response header.',
  },
  {
    id: 'D',
    description:
      'Negative control: no nonce request CSP header, no x-nonce header, and nonce Report-Only response header only.',
  },
];

function compactCsp(value) {
  return value.replace(/\s{2,}/g, ' ').trim();
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, ...options.env },
      stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', chunk => {
      stdout += chunk;
      if (options.forwardOutput) process.stdout.write(chunk);
    });
    child.stderr?.on('data', chunk => {
      stderr += chunk;
      if (options.forwardOutput) process.stderr.write(chunk);
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited ${code}\n${stdout}\n${stderr}`));
    });
  });
}

async function writeText(relativePath, contents) {
  const absolutePath = path.join(appRoot, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents);
}

async function prepareApp() {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(appRoot, { recursive: true });
  await mkdir(artifactRoot, { recursive: true });
  await symlink(path.join(webRoot, 'node_modules'), path.join(appRoot, 'node_modules'), 'dir');

  await writeText(
    'package.json',
    JSON.stringify(
      {
        private: true,
        type: 'module',
        scripts: {
          build: 'next build --webpack',
          start: 'next start',
        },
        dependencies: {
          next: '16.2.4',
          react: '19.2.5',
          'react-dom': '19.2.5',
        },
      },
      null,
      2
    ) + '\n'
  );

  await writeText(
    'next.config.mjs',
    `/** @type {import('next').NextConfig} */\nconst nextConfig = {\n  poweredByHeader: false,\n};\n\nexport default nextConfig;\n`
  );

  await writeText(
    'tsconfig.json',
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2017',
          lib: ['dom', 'dom.iterable', 'esnext'],
          allowJs: true,
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          esModuleInterop: true,
          module: 'esnext',
          moduleResolution: 'bundler',
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: 'react-jsx',
          incremental: true,
          plugins: [{ name: 'next' }],
        },
        include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
        exclude: ['node_modules'],
      },
      null,
      2
    ) + '\n'
  );

  await writeText(
    'next-env.d.ts',
    `/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n`
  );

  const proxySource = [
    "import { NextRequest, NextResponse } from 'next/server';",
    '',
    `const nonce = '${nonce}';`,
    `const reportUri = '${reportUri}';`,
    '',
    "type CaseId = 'A' | 'B' | 'C' | 'D';",
    '',
    'function compact(value: string): string {',
    String.raw`  return value.replace(/\s{2,}/g, ' ').trim();`,
    '}',
    '',
    'function noncePolicy(): string {',
    '  return compact([',
    `    "default-src 'self';",`,
    `    "script-src 'self' 'nonce-" + nonce + "' 'strict-dynamic';",`,
    `    "style-src 'self' 'nonce-" + nonce + "';",`,
    `    "img-src 'self' data: blob:;",`,
    `    "font-src 'self';",`,
    `    "object-src 'none';",`,
    `    "base-uri 'self';",`,
    `    "form-action 'self';",`,
    "    'report-uri ' + reportUri + ';',",
    "  ].join(' '));",
    '}',
    '',
    'function enforcedBaselinePolicy(): string {',
    '  return compact([',
    `    "default-src 'self';",`,
    `    "script-src 'self';",`,
    `    "style-src 'self' 'unsafe-inline';",`,
    `    "img-src 'self' data: blob:;",`,
    `    "font-src 'self';",`,
    `    "object-src 'none';",`,
    `    "base-uri 'self';",`,
    `    "form-action 'self';",`,
    "  ].join(' '));",
    '}',
    '',
    'export function proxy(request: NextRequest) {',
    "  const caseId = (process.env.SEC05_CSP_CASE ?? 'A') as CaseId;",
    '  const requestHeaders = new Headers(request.headers);',
    '  const nonceCsp = noncePolicy();',
    '',
    "  if (caseId === 'A') {",
    "    requestHeaders.set('x-nonce', nonce);",
    "    requestHeaders.set('Content-Security-Policy', nonceCsp);",
    '    const response = NextResponse.next({ request: { headers: requestHeaders } });',
    "    response.headers.set('x-sec05-case', caseId);",
    "    response.headers.set('x-nonce', nonce);",
    "    response.headers.set('Content-Security-Policy', nonceCsp);",
    '    return response;',
    '  }',
    '',
    "  if (caseId === 'B') {",
    "    requestHeaders.set('x-nonce', nonce);",
    "    requestHeaders.set('Content-Security-Policy', nonceCsp);",
    '    const response = NextResponse.next({ request: { headers: requestHeaders } });',
    "    response.headers.set('x-sec05-case', caseId);",
    "    response.headers.set('x-nonce', nonce);",
    "    response.headers.set('Content-Security-Policy', enforcedBaselinePolicy());",
    "    response.headers.set('Content-Security-Policy-Report-Only', nonceCsp);",
    '    return response;',
    '  }',
    '',
    "  if (caseId === 'C') {",
    "    requestHeaders.set('x-nonce', nonce);",
    "    requestHeaders.set('Content-Security-Policy-Report-Only', nonceCsp);",
    '    const response = NextResponse.next({ request: { headers: requestHeaders } });',
    "    response.headers.set('x-sec05-case', caseId);",
    "    response.headers.set('x-nonce', nonce);",
    "    response.headers.set('Content-Security-Policy-Report-Only', nonceCsp);",
    '    return response;',
    '  }',
    '',
    '  const response = NextResponse.next({ request: { headers: requestHeaders } });',
    "  response.headers.set('x-sec05-case', caseId);",
    "  response.headers.set('Content-Security-Policy-Report-Only', nonceCsp);",
    '  return response;',
    '}',
    '',
  ].join('\n');
  await writeText('proxy.ts', proxySource);

  await writeText(
    'app/client-marker.tsx',
    `'use client';\n\nimport { useState } from 'react';\n\nexport function ClientMarker() {\n  const [count, setCount] = useState(0);\n\n  return (\n    <button data-testid="client-marker" onClick={() => setCount(value => value + 1)}>\n      client-marker-{count}\n    </button>\n  );\n}\n`
  );

  await writeText(
    'app/layout.tsx',
    `import { headers } from 'next/headers';\nimport type { ReactNode } from 'react';\n\nexport const dynamic = 'force-dynamic';\n\nexport default async function RootLayout({ children }: { children: ReactNode }) {\n  const nonce = (await headers()).get('x-nonce') ?? '';\n\n  return (\n    <html lang="en">\n      <body>\n        <div data-csp-nonce-probe={nonce} />\n        {children}\n      </body>\n    </html>\n  );\n}\n`
  );

  await writeText(
    'app/page.tsx',
    `import { headers } from 'next/headers';\nimport { connection } from 'next/server';\nimport Script from 'next/script';\n\nimport { ClientMarker } from './client-marker';\n\nexport default async function Page() {\n  await connection();\n  const nonce = (await headers()).get('x-nonce') ?? undefined;\n\n  return (\n    <main>\n      <h1 data-testid="sec05-ready">SEC05 Next CSP Nonce Triage</h1>\n      <ClientMarker />\n      <Script id="sec05-inline-script" nonce={nonce}>{'window.__sec05InlineScript = true;'}</Script>\n    </main>\n  );\n}\n`
  );
}

function isWhitespace(char) {
  return /\s/.test(char ?? '');
}

function skipWhitespace(value, index) {
  while (index < value.length) {
    if (!isWhitespace(value[index])) break;
    index += 1;
  }
  return index;
}

function isAttributeNameChar(char) {
  return Boolean(char && !/[\s=/>]/.test(char));
}

function readAttributeName(tag, index) {
  const start = index;
  while (index < tag.length && isAttributeNameChar(tag[index])) {
    index += 1;
  }
  return { name: tag.slice(start, index).toLowerCase(), index };
}

function readQuotedValue(tag, index, quote) {
  const start = index + 1;
  const end = tag.indexOf(quote, start);
  if (end === -1) return { value: tag.slice(start), index: tag.length };
  return { value: tag.slice(start, end), index: end + 1 };
}

function readBareValue(tag, index) {
  const start = index;
  while (index < tag.length && !isWhitespace(tag[index]) && tag[index] !== '>') {
    index += 1;
  }
  return { value: tag.slice(start, index), index };
}

function readAttributeValue(tag, index) {
  index = skipWhitespace(tag, index);
  if (tag[index] !== '=') return { value: '', index };

  index = skipWhitespace(tag, index + 1);
  const quote = tag[index];
  if (quote === '"' || quote === "'") return readQuotedValue(tag, index, quote);
  return readBareValue(tag, index);
}

function parseAttributes(tag) {
  const attributes = {};
  let index = tag.search(/\s/);
  if (index === -1) return attributes;

  while (index < tag.length) {
    index = skipWhitespace(tag, index);
    if (index >= tag.length || tag[index] === '>' || tag[index] === '/') break;

    const parsedName = readAttributeName(tag, index);
    if (!parsedName.name) break;

    const parsedValue = readAttributeValue(tag, parsedName.index);
    attributes[parsedName.name] = parsedValue.value;
    index = parsedValue.index;
  }

  return attributes;
}

function scriptInventory(html) {
  const scripts = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let index = 0;
  for (const match of html.matchAll(pattern)) {
    const attributes = parseAttributes(`script${match[1]}`);
    scripts.push({
      index,
      src: attributes.src ?? null,
      nonce: attributes.nonce ?? null,
      async: Object.hasOwn(attributes, 'async'),
      defer: Object.hasOwn(attributes, 'defer'),
      inlineLength: match[2]?.length ?? 0,
      firstParty:
        !attributes.src || attributes.src.startsWith('/_next/') || attributes.src.startsWith('/'),
    });
    index += 1;
  }
  return scripts;
}

function summarizeScripts(scripts) {
  const firstParty = scripts.filter(script => script.firstParty);
  const missingNonce = firstParty.filter(script => script.nonce !== nonce);
  return {
    scriptTagCount: scripts.length,
    firstPartyScriptCount: firstParty.length,
    missingFirstPartyNonceCount: missingNonce.length,
    firstMissingFirstPartyScripts: missingNonce.slice(0, 10),
  };
}

function request(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      })
      .on('error', reject);
  });
}

function parseConfiguredFirstPort() {
  const rawPort = process.env.SEC05_FIRST_PORT;
  if (!rawPort) return null;

  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port < 1024 || port + cases.length > 65535) {
    throw new Error(`SEC05_FIRST_PORT must leave ${cases.length} usable ports in 1024..65535.`);
  }

  return port;
}

function canListenOnPort(port) {
  return new Promise(resolve => {
    const server = http.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

async function allocateEphemeralPort(usedPorts) {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => {
        if (!port) {
          reject(new Error('Unable to allocate an ephemeral SEC05 triage port.'));
          return;
        }
        if (usedPorts.has(port)) {
          allocateEphemeralPort(usedPorts).then(resolve, reject);
          return;
        }
        usedPorts.add(port);
        resolve(port);
      });
    });
  });
}

async function selectPorts() {
  const configuredFirstPort = parseConfiguredFirstPort();
  if (configuredFirstPort !== null) {
    const configuredPorts = cases.map((_, index) => configuredFirstPort + index);
    for (const port of configuredPorts) {
      if (!(await canListenOnPort(port))) {
        throw new Error(`SEC05 configured port ${port} is already in use.`);
      }
    }
    return configuredPorts;
  }

  const preferredPorts = cases.map((_, index) => preferredFirstPort + index);
  const preferredResults = await Promise.all(preferredPorts.map(port => canListenOnPort(port)));
  if (preferredResults.every(Boolean)) return preferredPorts;

  const usedPorts = new Set();
  const ports = [];
  for (const _testCase of cases) {
    ports.push(await allocateEphemeralPort(usedPorts));
  }
  return ports;
}

async function waitForServer(url) {
  const startedAt = Date.now();
  let lastStatus = null;
  while (Date.now() - startedAt < 30000) {
    try {
      const response = await request(url);
      lastStatus = response.status ?? null;
      if (response.status === 200) return;
    } catch {
      // Keep polling until Next is ready.
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const suffix = lastStatus === null ? '' : `; last status=${lastStatus}`;
  throw new Error(`Timed out waiting for ${url}${suffix}`);
}

function startServer(caseId, port) {
  const child = spawn(
    process.execPath,
    [nextBin, 'start', '--hostname', host, '--port', String(port)],
    {
      cwd: appRoot,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        SEC05_CSP_CASE: caseId,
        NEXT_TELEMETRY_DISABLED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  let output = '';
  child.stdout.on('data', chunk => {
    output += chunk;
  });
  child.stderr.on('data', chunk => {
    output += chunk;
  });
  return { child, getOutput: () => output };
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise(resolve => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function groupViolations(violations) {
  const scriptFamily = new Set(['script-src', 'script-src-elem', 'script-src-attr']);
  const grouped = {};
  for (const violation of violations) {
    if (!scriptFamily.has(violation.effectiveDirective)) continue;
    const key = `${violation.effectiveDirective}|${violation.blockedURI || 'inline'}`;
    grouped[key] = (grouped[key] ?? 0) + 1;
  }
  return grouped;
}

async function captureBrowser(url) {
  const playwright = await import(requireFromWeb.resolve('@playwright/test'));
  const chromium = playwright.chromium ?? playwright.default?.chromium;
  if (!chromium) {
    throw new Error('Unable to resolve Playwright chromium from apps/web dependencies.');
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      globalThis.__sec05CspViolations = [];
      document.addEventListener('securitypolicyviolation', event => {
        globalThis.__sec05CspViolations.push({
          effectiveDirective: event.effectiveDirective,
          blockedURI: event.blockedURI,
          violatedDirective: event.violatedDirective,
          disposition: event.disposition,
          sourceFile: event.sourceFile,
          lineNumber: event.lineNumber,
        });
      });
    });
    await page.goto(url, { waitUntil: 'networkidle' });
    const domScripts = await page.$$eval('script', nodes =>
      nodes.map((node, index) => ({
        index,
        src: node.getAttribute('src'),
        nonce: node.getAttribute('nonce') || node.nonce || null,
        inlineLength: node.textContent?.length ?? 0,
        firstParty:
          !node.getAttribute('src') ||
          node.getAttribute('src')?.startsWith('/_next/') ||
          node.getAttribute('src')?.startsWith('/') ||
          false,
      }))
    );
    const canary = await page.locator('[data-csp-nonce-probe]').getAttribute('data-csp-nonce-probe');
    const violations = await page.evaluate(() => globalThis.__sec05CspViolations ?? []);
    return {
      canary,
      domScripts,
      domScriptSummary: summarizeScripts(domScripts),
      violations,
      scriptFamilyViolationGroups: groupViolations(violations),
    };
  } finally {
    await browser.close();
  }
}

async function runCase(testCase, port) {
  const url = `http://${host}:${port}/`;
  const server = startServer(testCase.id, port);
  try {
    await waitForServer(url);
    const response = await request(url);
    const rawScripts = scriptInventory(response.body);
    const browser = await captureBrowser(url);
    const caseArtifactRoot = path.join(artifactRoot, `case-${testCase.id}`);
    await mkdir(caseArtifactRoot, { recursive: true });
    await writeFile(path.join(caseArtifactRoot, 'response.html'), response.body);
    await writeFile(
      path.join(caseArtifactRoot, 'headers.json'),
      JSON.stringify(response.headers, null, 2) + '\n'
    );

    return {
      id: testCase.id,
      description: testCase.description,
      url,
      status: response.status,
      headers: {
        'x-nonce': response.headers['x-nonce'] ?? null,
        'content-security-policy': response.headers['content-security-policy'] ?? null,
        'content-security-policy-report-only':
          response.headers['content-security-policy-report-only'] ?? null,
      },
      expectedNonce: nonce,
      rawHtmlScriptSummary: summarizeScripts(rawScripts),
      firstRawHtmlScripts: rawScripts.slice(0, 10),
      browser,
    };
  } finally {
    await stopServer(server.child);
    await writeFile(
      path.join(artifactRoot, `case-${testCase.id}-next-server.log`),
      server.getOutput()
    );
  }
}

async function main() {
  await prepareApp();

  const nextPackage = JSON.parse(
    await readFile(path.join(webRoot, 'node_modules/next/package.json'), 'utf8')
  );

  await run(process.execPath, [nextBin, 'build', '--webpack'], {
    cwd: appRoot,
    env: { NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  const ports = await selectPorts();
  const results = [];
  for (const [index, testCase] of cases.entries()) {
    results.push(await runCase(testCase, ports[index]));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    nextVersion: nextPackage.version,
    nonce,
    ports: Object.fromEntries(cases.map((testCase, index) => [testCase.id, ports[index]])),
    noncePolicy: compactCsp(`
      default-src 'self';
      script-src 'self' 'nonce-${nonce}' 'strict-dynamic';
      style-src 'self' 'nonce-${nonce}';
      img-src 'self' data: blob:;
      font-src 'self';
      object-src 'none';
      base-uri 'self';
      form-action 'self';
      report-uri ${reportUri};
    `),
    cases: results,
  };

  await writeFile(path.join(outputRoot, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
