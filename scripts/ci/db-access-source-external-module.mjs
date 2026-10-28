export function createExternalModuleResolver(packages, moduleFile) {
  return function externalModule(name, from) {
    if (
      name.startsWith('.') ||
      name.startsWith('@/') ||
      name.startsWith('@interdomestik/') ||
      name.startsWith('#') ||
      moduleFile(name, from)
    )
      return false;
    const packageName = name.startsWith('@')
      ? name.split('/').slice(0, 2).join('/')
      : name.split('/')[0];
    const manifest = [...packages.values()]
      .filter(item => from.startsWith(item.base + '/'))
      .sort((a, b) => b.base.length - a.base.length)[0];
    return (
      name.startsWith('node:') ||
      ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].some(
        key => manifest?.[key]?.[packageName]
      )
    );
  };
}
