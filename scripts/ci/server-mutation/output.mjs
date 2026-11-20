// Output of the server-mutation scanner: the JSON report (always written, also on error) and
// GitHub `::notice` annotations only — never warning or error annotations (design §7, r5 B13).
import fs from 'node:fs';
import path from 'node:path';

const escapeData = text =>
  String(text).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
const escapeProperty = text => escapeData(text).replaceAll(':', '%3A').replaceAll(',', '%2C');
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

// ` file=…,line=…` of a finding's notice, or empty when the finding has no file.
function noticeLocation(finding) {
  if (!finding?.file) return '';
  const line = finding.line ? `,line=${finding.line}` : '';
  return ` file=${escapeProperty(finding.file)}${line}`;
}

export function annotate(report, results, out = process.stdout) {
  const lines = [];
  for (const error of report.errors)
    lines.push(`::notice title=server-mutation error::${escapeData(error)}`);
  for (const result of results) {
    const byId = new Map(result.findings.map(finding => [finding.id, finding]));
    for (const id of result.new) {
      const finding = byId.get(id);
      const title = escapeProperty(`${result.id} new`);
      const text = escapeData(`${id}: ${finding?.message ?? ''}`);
      lines.push(`::notice${noticeLocation(finding)} title=${title}::${text}`);
    }
    const tamperTitle = escapeProperty(`${result.id} baseline`);
    for (const id of result.tamper) lines.push(`::notice title=${tamperTitle}::${escapeData(id)}`);
  }
  const shown = lines.slice(0, MAX_NOTICES);
  if (lines.length > shown.length)
    shown.push(`::notice title=server-mutation::${lines.length - shown.length} more in the report`);
  const summary = results.map(r => {
    const mode = r.enforcing ? ' (enforcing)' : '';
    return `${r.id}: units ${JSON.stringify(r.units)}, total ${r.total}, new ${r.new.length}, fixed ${r.fixed.length}, tamper ${r.tamper.length}${mode}`;
  });
  const bootstrap = report.bootstrap ? ' (bootstrap)' : '';
  const status = `status ${report.status}${bootstrap}, exit ${report.exit}`;
  out.write(`${[...shown, ...summary, status].join('\n')}\n`);
}
