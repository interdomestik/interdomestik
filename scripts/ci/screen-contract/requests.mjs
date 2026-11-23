// The request rules of the fixed configuration (the WP-05 flip, D-1): which request forms and
// module requests the model covers, the reviewed exceptions, and the description-file check. Split
// from resolution.mjs, unchanged.
import fs from 'node:fs';
import path from 'node:path';

import { refuse } from './refusal.mjs';

// Request forms D-1 does not model, refused wherever an edge is classified (`kindOfSpecifier`):
// an absolute or server-relative path (webpack's `roots`), an inline loader (`!`), a package import
// (`#…`, a `package.json` `imports` map), a URL scheme other than `node:` (webpack's `file:` and
// `data:`), and Next's built-in aliases that point into the app (`private-next-root-dir`,
// `private-next-app-dir`, `private-next-pages`, `private-dot-next`, the `private-next-rsc-…` and
// `private-next-instrumentation-…` keys; `create-compiler-aliases.js`). None occurs on today's tree.
const UNMODELLED_REQUEST = /^(?:\/|#|private-(?:next|dot-next))|!|^(?!node:)[a-z][a-z0-9+.-]*:/iu;
export function assertModelledRequest(specifier) {
  if (UNMODELLED_REQUEST.test(specifier))
    refuse(`the request ${specifier} is a form D-1 does not model`);
}

// Module requests that are not a literal specifier (webpack builds a context module, or loads a
// file by URL, or the request escapes the bundler): a non-literal `import()` or `require()`, any
// other use of `require` (`require.context`, `require.resolve`, `require.ensure`, a bare
// `require`), AMD `define(…)`, `createRequire(…)`, `import.meta.<x>` other than `url`, and
// `new X(…, import.meta.url)` (an asset or worker). Only the reviewed occurrences below, by file
// and exact source text, are accepted; each loads no source file of a layer (message catalogues,
// test helpers, and Node-only database tooling), and none yields a target.
const REVIEWED_DYNAMIC_REQUESTS = Object.freeze({
  'apps/web/src/app/[locale]/_core.entry.tsx': ['import(`@/messages/${locale}/metadata.json`)'],
  'apps/web/src/i18n/messages.ts': [
    'import(`../messages/${locale}/${namespace}.json`)',
    'import(`../messages/${routing.defaultLocale}/${namespace}.json`)',
  ],
  'apps/web/src/features/help-now/sw-test-utils.ts': [
    'import(OFFLINE_HELPER_MODULE)',
    'import(WORKER_MODULE)',
  ],
  'packages/database/src/migration-callback-source-verifier.ts': [
    'createRequire(import.meta.url)',
    'import.meta.resolve',
    'import(url)',
  ],
  'packages/database/src/migration-corpus-root.ts': ["new URL('../drizzle/', import.meta.url)"],
  'packages/domain-communications/src/messages/public-reply-concurrency.runtime-fixture.ts': [
    "new URL('../../../../node_modules/tsx/dist/loader.mjs', import.meta.url)",
    "new URL('./public-reply-concurrency-worker.test-support.ts', import.meta.url)",
  ],
});
export function assertReviewedDynamicRequest(rel, text) {
  if (!(REVIEWED_DYNAMIC_REQUESTS[rel] ?? []).includes(text))
    refuse(`${rel ?? 'a file'} loads a module by ${text}, a request D-1 does not model`);
}

// A `browser` field in any `package.json` of the tree: the client build's `aliasFields` can remap a
// relative request inside that package to another file. None has one today. `node_modules` and
// build output are not the scanned tree's sources.
const SKIPPED_DIRS = new Set(['node_modules', '.git', '.next', '.turbo']);
export function assertDescriptionFiles(root) {
  const visit = rel => {
    for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory() && !SKIPPED_DIRS.has(entry.name)) visit(child);
      else if (entry.isFile() && entry.name === 'package.json') {
        let data;
        try {
          data = JSON.parse(fs.readFileSync(path.join(root, child), 'utf8'));
        } catch {
          refuse(`${child} is not parseable, so its browser field cannot be checked`);
        }
        if (data && typeof data === 'object' && Object.hasOwn(data, 'browser'))
          refuse(`${child} has a browser field, which the client build applies to its requests`);
      }
    }
  };
  visit('');
}

// A relative or `@/` request with a query or fragment (`?raw`, `#x`): webpack loads the path part
// through whatever loader the query selects, which D-1 does not model. Only the reviewed edges
// below are accepted, and they name the path part's file; every other one is refused. Both load
// `public/offline.html` as text (a test, and the help-now service-worker test helper).
const REVIEWED_QUERY_EDGES = Object.freeze({
  'apps/web/src/features/help-now/sw-test-utils.ts': '../../../public/offline.html?raw',
  'apps/web/src/lib/pwa/pwa-i18n-contract.test.ts': '../../../public/offline.html?raw',
});
// The request webpack resolves: the specifier, or the path part of a reviewed query edge. A relative
// or `@/` request through a `node_modules` directory (a pnpm workspace link, r6) is refused: the
// scanned tree has no links, and the build would follow one into tracked source. A backslash is
// refused too (r7): TypeScript and webpack may read it as a separator, which D-1 does not model.
export function requestPath(fromRel, specifier) {
  if (specifier.includes('\\'))
    refuse(`${fromRel} imports ${specifier}, a request with a backslash`);
  if (specifier.split(/[/?#]/u).includes('node_modules'))
    refuse(`${fromRel} imports ${specifier}, a request through node_modules`);
  const cut = specifier.search(/[?#]/u);
  if (cut === -1) return specifier;
  if (REVIEWED_QUERY_EDGES[fromRel] !== specifier)
    refuse(`${fromRel} imports ${specifier}, a request with a query or fragment`);
  return specifier.slice(0, cut);
}
