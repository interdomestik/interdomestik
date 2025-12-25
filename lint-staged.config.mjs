function byPrefix(prefix, files) {
  return files.filter(f => f.startsWith(prefix)).map(f => f.slice(prefix.length));
}

function eslintFixForWorkspace(filterName, prefix) {
  return files => {
    const rel = byPrefix(prefix, files);
    if (rel.length === 0) return [];
    return [
      `pnpm --filter ${filterName} lint -- --fix ${rel.map(f => JSON.stringify(f)).join(' ')}`,
    ];
  };
}

export default {
  '**/*.{ts,tsx,js,jsx,md,json,yml,yaml,css,scss}': ['prettier --write'],
  'apps/web/**/*.{ts,tsx,js,jsx}': eslintFixForWorkspace('@interdomestik/web', 'apps/web/'),
  'packages/ui/**/*.{ts,tsx,js,jsx}': eslintFixForWorkspace('@interdomestik/ui', 'packages/ui/'),
};
