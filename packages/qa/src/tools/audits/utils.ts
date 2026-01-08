import fs from 'node:fs';
import path from 'node:path';

export function checkFileExists(
  filePath: string,
  description: string
): { check: string | null; issue: string | null } {
  if (fs.existsSync(filePath)) {
    return { check: `✅ ${description} exists`, issue: null };
  }
  return { check: null, issue: `❌ Missing ${description} (${path.basename(filePath)})` };
}

export function checkFileContains(
  filePath: string,
  search: string,
  description: string
): { check: string | null; issue: string | null } {
  if (!fs.existsSync(filePath)) {
    return { check: null, issue: `❌ Missing file for ${description} check` };
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  if (content.includes(search)) {
    return { check: `✅ ${description} configured`, issue: null };
  }
  return { check: null, issue: `⚠️ ${description} not found in ${path.basename(filePath)}` };
}
