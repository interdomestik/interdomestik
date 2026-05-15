import fs from 'fs/promises';
import { gzipSize } from 'gzip-size';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '..');
const NEXT_DIR = path.join(APP_DIR, '.next');
const MANIFEST_CANDIDATES = [
  path.join(NEXT_DIR, 'build-manifest.json'),
  path.join(NEXT_DIR, 'fallback-build-manifest.json'),
  path.join(NEXT_DIR, 'standalone', 'apps', 'web', '.next', 'build-manifest.json'),
  path.join(NEXT_DIR, 'standalone', 'apps', 'web', '.next', 'fallback-build-manifest.json'),
];
const LOADABLE_MANIFEST_CANDIDATES = [
  path.join(NEXT_DIR, 'react-loadable-manifest.json'),
  path.join(NEXT_DIR, 'standalone', 'apps', 'web', '.next', 'react-loadable-manifest.json'),
];
const CRM_CHART_CONTRACT_PATH = path.join(
  APP_DIR,
  'src',
  'components',
  'crm',
  'charts',
  'chart-contract.ts'
);

// Budget Configuration
// For App Router, 'rootMainFiles' represents the global client bundle (React, Next.js, Global Layout).
const GLOBAL_BUDGET = { gzip: 250 * 1024, name: 'Global Initial JS (Baseline)' };
const CRM_REPORTING_CHART_BUDGET = {
  dynamicImportPrefix: 'components/crm/charts/reporting-chart-boundary.tsx -> ',
  name: 'CRM Reporting Chart Route Dynamic JS',
  routes: [
    {
      imports: ['./pipeline-amount-chart'],
      name: '/agent/crm',
    },
    {
      imports: ['./pipeline-amount-chart'],
      name: '/admin/crm',
    },
    {
      imports: ['./pipeline-amount-chart', './funnel-movement-chart', './stage-velocity-chart'],
      name: '/staff/crm',
    },
  ],
};

async function findManifestPath() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    for (const manifestPath of MANIFEST_CANDIDATES) {
      try {
        const stats = await fs.stat(manifestPath);
        if (stats.size > 0) {
          return manifestPath;
        }
      } catch {
        // Keep scanning candidates.
      }
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return null;
}

async function findLoadableManifestPath() {
  for (const manifestPath of LOADABLE_MANIFEST_CANDIDATES) {
    try {
      const stats = await fs.stat(manifestPath);
      if (stats.size > 0) {
        return manifestPath;
      }
    } catch {
      // Keep scanning candidates.
    }
  }

  return null;
}

async function readCrmReportingChartBudget() {
  const contract = await fs.readFile(CRM_CHART_CONTRACT_PATH, 'utf-8');
  const match = contract.match(/CRM_REPORTING_CHART_BUNDLE_DELTA_KB_MAX\s*=\s*(\d+)/);

  if (!match) {
    throw new Error('CRM reporting chart bundle budget constant not found');
  }

  return Number(match[1]) * 1024;
}

async function readChunkSize(file) {
  const content = await fs.readFile(path.join(NEXT_DIR, file));
  return gzipSize(content);
}

function chartImportKey(moduleName) {
  return `${CRM_REPORTING_CHART_BUDGET.dynamicImportPrefix}${moduleName}`;
}

function routeChartFiles(loadableManifest, route) {
  const files = new Set();

  for (const moduleName of route.imports) {
    const entry = loadableManifest[chartImportKey(moduleName)];
    if (!entry) {
      throw new Error(`CRM reporting chart dynamic import not found: ${moduleName}`);
    }

    for (const file of entry.files ?? []) {
      if (file.endsWith('.js')) {
        files.add(file);
      }
    }
  }

  return [...files].sort((left, right) => left.localeCompare(right));
}

async function checkSize() {
  try {
    const manifestPath = await findManifestPath();

    if (!manifestPath) {
      const error = new Error('Build manifest not found');
      error.code = 'ENOENT';
      error.candidates = MANIFEST_CANDIDATES;
      throw error;
    }

    const manifestContent = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);
    // const pages = manifest.pages; // Not reliable for App Router specific page client chunks without deeper parsing

    let hasError = false;

    console.log('📊 Checking Bundle Sizes (Gzipped)...\n');

    // 1. Check Global Baseline (rootMainFiles)
    if (manifest.rootMainFiles) {
      let totalSize = 0;
      for (const file of manifest.rootMainFiles) {
        const filePath = path.join(NEXT_DIR, file);
        try {
          const content = await fs.readFile(filePath);
          const size = await gzipSize(content);
          totalSize += size;
        } catch {
          console.warn(`Warning: Could not read ${file}`);
        }
      }

      const limit = GLOBAL_BUDGET.gzip;
      const isOver = totalSize > limit;
      const icon = isOver ? '❌' : '✅';

      console.log(`${icon} ${GLOBAL_BUDGET.name}`);
      console.log(`   Size: ${(totalSize / 1024).toFixed(2)} KB`);
      console.log(`   Limit: ${(limit / 1024).toFixed(2)} KB`);
      console.log(`   Usage: ${((totalSize / limit) * 100).toFixed(1)}%\n`);

      if (isOver) {
        hasError = true;
        console.error(
          `ERROR: Global Initial JS exceeded budget by ${((totalSize - limit) / 1024).toFixed(2)} KB`
        );
      }
    } else {
      console.warn('⚠️ No rootMainFiles found in build manifest.');
    }

    // 2. Check CRM reporting chart dynamic route chunks. These chunks are client-only progressive
    // enhancements; the server-rendered table and metric bands remain the accessible baseline.
    const crmChartLimit = await readCrmReportingChartBudget();
    const loadableManifestPath = await findLoadableManifestPath();

    if (loadableManifestPath) {
      const loadableManifest = JSON.parse(await fs.readFile(loadableManifestPath, 'utf-8'));

      console.log(`✅ ${CRM_REPORTING_CHART_BUDGET.name}`);
      console.log(`   Limit per route: ${(crmChartLimit / 1024).toFixed(2)} KB`);

      for (const route of CRM_REPORTING_CHART_BUDGET.routes) {
        const files = routeChartFiles(loadableManifest, route);
        let routeSize = 0;
        const chunks = [];

        for (const file of files) {
          const size = await readChunkSize(file);
          routeSize += size;
          chunks.push({ file, size });
        }

        const isOver = routeSize > crmChartLimit;
        const icon = isOver ? '❌' : '✅';

        console.log(`   ${icon} ${route.name}: ${(routeSize / 1024).toFixed(2)} KB`);

        for (const chunk of chunks) {
          console.log(`      - ${chunk.file}: ${(chunk.size / 1024).toFixed(2)} KB`);
        }

        if (files.length === 0) {
          hasError = true;
          console.error(`ERROR: ${route.name} has no CRM reporting chart dynamic JS files`);
        }

        if (isOver) {
          hasError = true;
          console.error(
            `ERROR: ${route.name} exceeded CRM chart route budget by ${(
              (routeSize - crmChartLimit) /
              1024
            ).toFixed(2)} KB`
          );
        }
      }

      console.log('');
    } else {
      console.warn('⚠️ No react-loadable-manifest found; CRM chart route chunks not checked.');
    }

    if (hasError) {
      console.error('\n❌ Performance budget exceeded.');
      process.exit(1);
    } else {
      console.log('\n✨ All performance checks passed.');
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('❌ Build manifest not found. Tried these paths:');
      for (const candidate of error.candidates ?? MANIFEST_CANDIDATES) {
        console.error(`   - ${candidate}`);
      }
      process.exit(1);
    }
    console.error('❌ Failed to check bundle size:', error);
    process.exit(1);
  }
}

checkSize();
