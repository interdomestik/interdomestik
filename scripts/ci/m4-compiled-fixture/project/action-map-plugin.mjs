import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const names = ['runAdminAssignment', 'runAgentAssignment', 'runStaffAssignment'];
export class ActionMapPlugin {
  constructor(root) {
    this.root = root;
  }
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('M4ActionMap', compilation => {
      compilation.hooks.processAssets.tap(
        { name: 'M4ActionMap', stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT },
        () => {
          const target = path.join(this.root, 'app/actions.js'),
            maps = [];
          const visited = new Set();
          function inspect(module) {
            if (visited.has(module)) return;
            visited.add(module);
            if (visited.size > 100000) throw Error('Action module observation cap');
            const resource = module.resourceResolveData?.path ?? module.resource?.split('?')[0];
            if (resource === target && module.buildInfo?.rsc?.actionIds)
              maps.push(module.buildInfo.rsc.actionIds);
            for (const child of module.modules ?? []) inspect(child);
          }
          for (const module of compilation.modules) inspect(module);
          const unique = [...new Set(maps.map(value => JSON.stringify(value)))];
          if (unique.length !== 1)
            throw Error('Actual action compiler mapping absent or ambiguous');
          const metadata = JSON.parse(unique[0]);
          const exports = Object.fromEntries(
            Object.entries(metadata).map(([id, info]) => [
              id,
              typeof info === 'string' ? info : info?.name,
            ])
          );
          if (
            JSON.stringify(Object.values(exports).sort()) !== JSON.stringify(names) ||
            Object.keys(exports).some(id => !/^[a-f0-9]{40,64}$/u.test(id))
          )
            throw Error('Actual action export mapping refused');
          const value = {
            version: 1,
            kind: 'compiler-observed-action-map',
            source: 'app/actions.js',
            sourceSha256: createHash('sha256').update(fs.readFileSync(target)).digest('hex'),
            exports,
            nextVersion: '16.4.3',
            qualificationOnly: true,
          };
          compilation.emitAsset(
            '../m4-action-map.json',
            new compiler.webpack.sources.RawSource(JSON.stringify(value, null, 2) + '\n')
          );
        }
      );
    });
  }
}
