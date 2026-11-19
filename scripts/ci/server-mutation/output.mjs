// Output of the server-mutation scanner: the JSON report (always written, also on error) and
// GitHub `::notice` annotations only — never warning or error annotations (design §7, r5 B13).
import fs from 'node:fs';
import path from 'node:path';

const escapeData = text =>
  String(text).replace(/%/gu, '%25').replace(/\r/gu, '%0D').replace(/\n/gu, '%0A');
const escapeProperty = text => escapeData(text).replace(/:/gu, '%3A').replace(/,/gu, '%2C');
const MAX_NOTICES = 50;

export function writeReport(file, report, results) {
  const body = { ...report };
  body.findings = Object.fromEntries(
    results.map(result => [
      result.id,
      result.findings.map(({ id, file: at, line, message }) => ({ id, file: at, line, message })),
    ])
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
}

export function annotate(report, results, out = process.stdout) {
  const lines = [];
  for (const error of report.errors)
    lines.push(`::notice title=server-mutation error::${escapeData(error)}`);
  for (const result of results) {
    const byId = new Map(result.findings.map(finding => [finding.id, finding]));
    for (const id of result.new) {
      const finding = byId.get(id);
      const where = finding?.file
        ? ` file=${escapeProperty(finding.file)}${finding.line ? `,line=${finding.line}` : ''}`
        : '';
      lines.push(
        `::notice${where} title=${escapeProperty(`${result.id} new`)}::${escapeData(`${id}: ${finding?.message ?? ''}`)}`
      );
    }
    for (const id of result.tamper)
      lines.push(`::notice title=${escapeProperty(`${result.id} baseline`)}::${escapeData(id)}`);
  }
  const shown = lines.slice(0, MAX_NOTICES);
  if (lines.length > shown.length)
    shown.push(`::notice title=server-mutation::${lines.length - shown.length} more in the report`);
  const summary = results.map(
    r =>
      `${r.id}: units ${JSON.stringify(r.units)}, total ${r.total}, new ${r.new.length}, fixed ${r.fixed.length}, tamper ${r.tamper.length}${r.enforcing ? ' (enforcing)' : ''}`
  );
  out.write(
    `${[...shown, ...summary, `status ${report.status}${report.bootstrap ? ' (bootstrap)' : ''}, exit ${report.exit}`].join('\n')}\n`
  );
}
