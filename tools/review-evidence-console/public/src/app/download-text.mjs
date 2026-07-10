export function downloadText(text, filename, { documentRef = document, urlRef = URL } = {}) {
  if (typeof text !== 'string' || text.length > 1_000_000) return false;
  const href = urlRef.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = documentRef.createElement('a');
  link.href = href;
  link.download = filename;
  link.click();
  urlRef.revokeObjectURL(href);
  return true;
}
