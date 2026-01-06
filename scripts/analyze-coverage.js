const fs = require('fs');
const path = require('path');

const coveragePath = path.resolve(process.cwd(), 'apps/web/coverage/coverage-final.json');

try {
  const data = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
  const results = [];

  for (const [filePath, codeCoverage] of Object.entries(data)) {
    const { statementMap, s } = codeCoverage;
    const totalStatements = Object.keys(statementMap).length;
    let coveredStatements = 0;

    for (const key of Object.keys(s)) {
      if (s[key] > 0) {
        coveredStatements++;
      }
    }

    const percentage = totalStatements === 0 ? 100 : (coveredStatements / totalStatements) * 100;

    // Only care about files strictly inside apps/web/src
    if (
      filePath.includes('apps/web/src') &&
      !filePath.includes('.test.') &&
      !filePath.includes('.spec.')
    ) {
      results.push({
        file: path.relative(process.cwd(), filePath),
        coverage: percentage,
        total: totalStatements,
        covered: coveredStatements,
      });
    }
  }

  // Sort by coverage ascending
  results.sort((a, b) => a.coverage - b.coverage);

  console.log('--- Low Coverage Files ---');
  results
    .filter(r => r.coverage < 90)
    .forEach(r => {
      console.log(`${r.coverage.toFixed(2)}% | ${r.file} (${r.covered}/${r.total})`);
    });
} catch (err) {
  console.error('Error analyzing coverage:', err);
}
