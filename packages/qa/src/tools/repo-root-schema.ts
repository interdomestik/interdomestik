const repoRoot = {
  type: 'string',
  description: 'Absolute Git worktree root for this repo-bound call',
} as const;

export function withRepoRoot(properties: Record<string, unknown> = {}, required: string[] = []) {
  return {
    type: 'object',
    properties: { repoRoot: { ...repoRoot }, ...properties },
    required: ['repoRoot', ...required],
  };
}
