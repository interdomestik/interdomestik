function formatBytes(bytes) {
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return unitIndex === 0
    ? `${value} ${units[unitIndex]}`
    : `${value.toFixed(2)} ${units[unitIndex]}`;
}

function safeDisplay(value) {
  const text = String(value).replace(/[\u0000-\u001f\u007f]/gu, character => {
    const code = character.codePointAt(0).toString(16).padStart(2, '0');
    return `\\x${code}`;
  });
  return text.startsWith('::') ? `\\${text}` : text;
}

function printTable(rows, columns) {
  const widths = columns.map(column =>
    Math.max(column.header.length, ...rows.map(row => safeDisplay(column.value(row)).length))
  );
  console.log(columns.map((column, index) => column.header.padEnd(widths[index])).join('  '));
  console.log(columns.map((_, index) => '-'.repeat(widths[index])).join('  '));
  for (const row of rows)
    console.log(
      columns
        .map((column, index) => safeDisplay(column.value(row)).padEnd(widths[index]))
        .join('  ')
    );
}

export function printBudgetResult(result) {
  if (result.passed) {
    console.log('Repo size budget passed.');
    return;
  }
  console.error('Repo size budget failed.');
  const rows = result.violations.map(violation => {
    const isBytes = violation.code.includes('bytes') || violation.code.startsWith('category:');
    return {
      ...violation,
      actualDisplay: isBytes ? formatBytes(violation.actual) : violation.actual,
      limitDisplay: isBytes ? formatBytes(violation.limit) : violation.limit,
    };
  });
  printTable(rows, [
    { header: 'Code', value: row => row.code },
    { header: 'Actual', value: row => row.actualDisplay },
    { header: 'Limit', value: row => row.limitDisplay },
    { header: 'Label', value: row => row.label },
  ]);
}

export function printReport(report) {
  console.log('Repo Size Audit');
  console.log(`Repo files: ${report.tracked.total.files}`);
  console.log(`Repo file size: ${formatBytes(report.tracked.total.bytes)}`);
  if (report.localDisk?.length) {
    console.log('\nLocal Disk Artifacts');
    printTable(report.localDisk, [
      { header: 'Size', value: row => formatBytes(row.bytes) },
      { header: 'Path', value: row => row.path },
    ]);
  }
  console.log('\nTracked Categories');
  printTable(report.tracked.categories, [
    { header: 'Size', value: row => formatBytes(row.bytes) },
    { header: 'Files', value: row => row.files },
    { header: 'Category', value: row => row.name },
  ]);
  console.log('\nTop Tracked Directories');
  printTable(report.tracked.directories.slice(0, report.options.top), [
    { header: 'Size', value: row => formatBytes(row.bytes) },
    { header: 'Files', value: row => row.files },
    { header: 'Directory', value: row => row.name },
  ]);
  console.log('\nLargest Tracked Files');
  printTable(report.tracked.largestFiles, [
    { header: 'Size', value: row => formatBytes(row.bytes) },
    { header: 'Path', value: row => row.path },
  ]);
  console.log(`\nSource/Test Hotspots >= ${report.options.minLines} Lines`);
  printTable(report.tracked.sourceHotspots, [
    { header: 'Lines', value: row => row.lines },
    { header: 'Size', value: row => formatBytes(row.bytes) },
    { header: 'Path', value: row => row.path },
  ]);
}
