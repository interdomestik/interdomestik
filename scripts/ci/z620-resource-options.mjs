const RESOURCE_OPTIONS = new Set([
  'attempt',
  'evidence-dir',
  'include-conditional',
  'lane',
  'lanes',
  'sha',
  'state-root',
]);

export function parseResourceOptions(argumentsList) {
  const options = {};
  for (const argument of argumentsList) {
    if (argument === '--') {
      throw new Error('Resource runner does not accept arbitrary commands');
    }
    if (!argument.startsWith('--') || !argument.includes('=')) {
      throw new Error(`Invalid resource option ${argument}`);
    }
    const [key, ...valueParts] = argument.slice(2).split('=');
    if (!RESOURCE_OPTIONS.has(key)) throw new Error(`Unknown resource option ${key}`);
    if (Object.hasOwn(options, key)) throw new Error(`Duplicate resource option ${key}`);
    const value = valueParts.join('=');
    if (!value) throw new Error(`Missing resource option value ${key}`);
    options[key] = value;
  }
  return options;
}
