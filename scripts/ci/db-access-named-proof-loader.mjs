import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';

// Controlled host ports, never candidate-selected modules or mocks. The VM is test isolation,
// not a security sandbox: all executed bytes are first authenticated by the fixed producer.
export function namedProofLoader({ provider, sentry = {}, environment = {}, ports = {} } = {}) {
  const manifest = JSON.parse(fs.readFileSync(new URL('./named-proof.json', import.meta.url)));
  const modules = new Map();
  const events = [];
  const context = createContext({
    Error,
    URL,
    Promise,
    Date,
    Set,
    Map,
    Object,
    Number,
    String,
    Boolean,
    RegExp,
    console: {
      log: (...args) => events.push(['log', ...args]),
      warn: (...args) => events.push(['warn', ...args]),
      error: (...args) => events.push(['error', ...args]),
    },
    process: {
      env: environment,
      on: (event, fn) => events.push(['handler', event, fn]),
      exit: code => {
        events.push(['exit', code]);
      },
      cwd: () => process.cwd(),
      memoryUsage: () => ({}),
      cpuUsage: () => ({}),
    },
    fetch: () => {
      throw new Error('unexpected network access in named proof');
    },
  });
  const externals = {
    '@sentry/nextjs': {
      init() {},
      captureRequestError() {},
      addBreadcrumb() {},
      captureMessage() {},
      ...sentry,
    },
    '@interdomestik/database/db': provider,
    'dotenv/config': {},
    dotenv: { config() {} },
    path: { default: path },
    fs: { default: fs },
    url: { fileURLToPath: value => new URL(value).pathname },
    ...ports,
  };
  async function external(name) {
    const key = 'external:' + name;
    if (modules.has(key)) return modules.get(key);
    const values = externals[name];
    if (!values) throw new Error('unbound named proof host port ' + name);
    const module = new SyntheticModule(
      Object.keys(values),
      function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      },
      { context }
    );
    modules.set(key, module);
    await module.link(() => {
      throw new Error('synthetic dependency');
    });
    await module.evaluate();
    return module;
  }
  async function link(specifier, parent) {
    if (Object.hasOwn(externals, specifier)) return external(specifier);
    const target = manifest.files[parent.identifier]?.imports[specifier];
    if (target === 'packages/database/src/db.ts') return external('@interdomestik/database/db');
    if (!target || !manifest.files[target])
      throw new Error('unbound named proof edge ' + specifier);
    return load(target);
  }
  async function load(file) {
    if (modules.has(file)) return modules.get(file);
    if (!manifest.files[file]) throw new Error('unknown named source ' + file);
    const compiled = new URL('./named-source/' + file + '.js', import.meta.url);
    const module = new SourceTextModule(fs.readFileSync(compiled, 'utf8'), {
      context,
      identifier: file,
      initializeImportMeta(meta) {
        meta.url = pathToFileURL(path.join(process.cwd(), file)).href;
      },
      async importModuleDynamically(specifier, parent) {
        const dependency = await link(specifier, parent);
        if (dependency.status === 'linked') await dependency.evaluate();
        return dependency;
      },
    });
    modules.set(file, module);
    await module.link(link);
    return module;
  }
  return {
    events,
    async import(file) {
      const module = await load(file);
      if (module.status === 'linked') await module.evaluate();
      return module.namespace;
    },
  };
}
