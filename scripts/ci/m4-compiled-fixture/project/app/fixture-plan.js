import fs from 'node:fs';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const id = x =>
  typeof x === 'string' && x.length > 0 && x.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(x);
export function validatePlan(value) {
  if (
    !value ||
    Object.keys(value).sort().join('|') !== 'runId|scenarios|version' ||
    value.version !== 1 ||
    !UUID.test(value.runId) ||
    !Array.isArray(value.scenarios) ||
    value.scenarios.length !== 3
  )
    throw Error('Fixture plan refused');
  const profiles = ['legacy-admin', 'legacy-agent', 'staff'];
  const claims = new Set();
  for (const [index, row] of value.scenarios.entries()) {
    if (
      !row ||
      Object.keys(row).sort().join('|') !== 'claimId|profile|staffId|targetMode' ||
      row.profile !== profiles[index] ||
      !id(row.claimId) ||
      claims.has(row.claimId) ||
      !['value', 'clear', 'omitted'].includes(row.targetMode) ||
      (row.targetMode === 'omitted' && row.profile !== 'staff') ||
      (row.targetMode === 'value' ? !id(row.staffId) : row.staffId !== null)
    )
      throw Error('Fixture scenario refused');
    claims.add(row.claimId);
  }
  return value;
}
export function readPlan() {
  const file = process.env.M4_COMPILED_FIXTURE_PLAN_FILE;
  if (!file || fs.realpathSync(file) !== file) throw Error('Physical fixture plan required');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = fs.fstatSync(fd);
    if (
      !before.isFile() ||
      before.uid !== process.getuid() ||
      before.mode & 0o077 ||
      before.size <= 0 ||
      before.size > 4096
    )
      throw Error('Owned bounded fixture plan required');
    const bytes = Buffer.alloc(before.size + 1),
      length = fs.readSync(fd, bytes, 0, bytes.length, 0);
    const after = fs.fstatSync(fd);
    if (
      length !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs
    )
      throw Error('Fixture plan changed');
    return validatePlan(JSON.parse(bytes.subarray(0, length).toString('utf8')));
  } finally {
    fs.closeSync(fd);
  }
}
