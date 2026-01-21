import { glob } from 'glob';
import fs from 'node:fs';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

async function audit() {
  console.log(`${BOLD}Starting Strict Core Purity Audit...${RESET}`);
  let violations = 0;

  // 1. Audit *_core.ts files for Next.js imports
  const coreFiles = await glob('apps/web/src/**/*_core.ts', { ignore: '**/node_modules/**' });
  const forbiddenNextImports = ['next/headers', 'next/cookies', 'next/navigation', 'next/server'];

  // Regex for imports: import ... from 'next/...'
  // Also check for Usage of NextRequest/NextResponse which might be imported purely but shouldn't be used in cores
  const nextRequestRegex = /NextRequest|NextResponse/;

  for (const file of coreFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Check for forbidden module imports
      for (const mod of forbiddenNextImports) {
        if (line.includes(`from '${mod}'`) || line.includes(`from "${mod}"`)) {
          console.error(`${RED}VIOLATION [Core Purity]${RESET}: ${file}:${index + 1}`);
          console.error(`  Importing forbidden Next.js module: ${BOLD}${mod}${RESET}`);
          violations++;
        }
      }

      // Check for NextRequest/NextResponse usage (ignoring comments slightly hard with simple regex, but good enough)
      if (nextRequestRegex.test(line) && !line.trim().startsWith('//')) {
        // Check if it's an import line, if so we handled it or it's from next/server
        // But if next/server is imported, condition 1 caught it.
        // If generic usage (e.g. type annotation), we want to catch it too unless it's just a comment.
        // Actually, if they import NextRequest from 'some-other-lib' it might be fine, but unlikely.
        // Let's rely mainly on the import check for robustness, but if they use the Type without importing it (global?), that's bad too.
        // For now, let's stick to explicit imports as the primarily strict rule.
        // However, the requirement says "NextRequest", "NextResponse" (either direct import or from next/server).
        // If I catch 'next/server', I catch most of them.
        // If I catch 'next/canary' or other internal paths?
        // Let's stick to the forbidden string list for now to avoid false positives on variable names like `hasNextRequest`.
      }
    });
  }

  // 2. Audit page.tsx wrappers for Direct DB access
  const pageFiles = await glob('apps/web/src/app/**/page.tsx', { ignore: '**/node_modules/**' });

  for (const file of pageFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (
      content.includes("'@interdomestik/database'") ||
      content.includes('"@interdomestik/database"')
    ) {
      // Double check it's an import
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (
          (line.trim().startsWith('import') || line.trim().startsWith('const')) &&
          (line.includes("'@interdomestik/database'") || line.includes('"@interdomestik/database"'))
        ) {
          // Exclude type imports if we want to be lenient?
          // "import type { ... } from ..." might be fine for props.
          // But typically db schema types are from @interdomestik/database/schema or similar.
          // The requirement says "import @interdomestik/database directly".
          // Let's enforce it strictly. Wrappers should receive DTOs, not DB entities usually,
          // or DTOs defined in core/contracts.
          // But sometimes page props might need a type.
          // Let's warn but maybe allowing `import type` is safer?
          // For now, strict: no db access.
          console.error(`${RED}VIOLATION [Wrapper Thinness]${RESET}: ${file}:${index + 1}`);
          console.error(`  Direct DB import forbidden in page.tsx. Use a service or core module.`);
          violations++;
        }
      });
    }
  }

  if (violations > 0) {
    console.error(`\n${RED}FAILED:${RESET} Found ${violations} purity violations.`);
    process.exit(1);
  } else {
    console.log(`\n${GREEN}PASSED:${RESET} No strict purity violations found.`);
  }
}

audit().catch(err => {
  console.error(err);
  process.exit(1);
});
