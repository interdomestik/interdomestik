export function goldenId(...parts: (string | number)[]): string {
  return `golden_${parts.join('_').toLowerCase()}`;
}

export function packId(packName: string, ...parts: (string | number)[]): string {
  return `pack_${packName}_${parts.join('_').toLowerCase()}`;
}
