export type EvidenceItem = {
  id: string;
  promptId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  capturedAt: string;
};

const STORAGE_KEY = 'interdomestik.helpNow.evidenceBundle.v1';

function readItems(): EvidenceItem[] {
  if (globalThis.localStorage === undefined) return [];
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EvidenceItem[]) : [];
  } catch {
    return [];
  }
}

function writeItems(items: EvidenceItem[]) {
  if (globalThis.localStorage === undefined) return;
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage can be blocked or quota-limited; capture remains local UI state only.
  }
}

export function listEvidenceItems(): EvidenceItem[] {
  return readItems();
}

export function saveEvidenceItem(promptId: string, file: File): EvidenceItem {
  const item: EvidenceItem = {
    id: `${promptId}-${Date.now()}`,
    promptId,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    capturedAt: new Date().toISOString(),
  };
  writeItems([...readItems().filter(existing => existing.promptId !== promptId), item]);
  return item;
}

export function clearEvidenceItems() {
  if (globalThis.localStorage === undefined) return;
  globalThis.localStorage.removeItem(STORAGE_KEY);
}
