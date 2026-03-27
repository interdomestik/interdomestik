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
];

// Budget Configuration
// For App Router, 'rootMainFiles' represents the global client bundle (React, Next.js, Global Layout).
const GLOBAL_BUDGET = { gzip: 250 * 1024, name: 'Global Initial JS (Baseline)' };

async function findManifestPath() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    for (const manifestPath of MANIFEST_CANDIDATES) {
      try {
        await fs.access(manifestPath);
        return manifestPath;
      } catch {
        // Keep scanning candidates.
      }
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return null;
}

async function checkSize() {
  try {
    const manifestPath = await findManifestPath();

    if (!manifestPath) {
      const error = new Error('Build manifest not found');
      error.code = 'ENOENT';
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

    if (hasError) {
      console.error('\n❌ Performance budget exceeded.');
      process.exit(1);
    } else {
      console.log('\n✨ All performance checks passed.');
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('❌ Build manifest not found. Run "pnpm build" first.');
      process.exit(1);
    }
    console.error('❌ Failed to check bundle size:', error);
    process.exit(1);
  }
}

checkSize();
