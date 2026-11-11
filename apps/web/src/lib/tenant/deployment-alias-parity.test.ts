import { afterEach, expect, it, vi } from 'vitest';
import { resolveDeploymentOrigin } from '@interdomestik/domain-communications/deployment-origin';
import { resolveCountryHostCompatibilityAlias } from './tenant-host-aliases';
import { stubDeploymentOrigin } from '../deployment-origin.test-support';

afterEach(() => vi.unstubAllEnvs());

it.each(['mk', 'ks', 'al', 'pilot'])(
  'destination collisions match the unchanged %s classifier for every IPv4 nip.io form',
  label => {
    stubDeploymentOrigin();
    const env = { ...process.env };
    // Reusing the routing module from destinations would change auth's guarded import closure.
    // Keep it unchanged and bind the destination-only predicate to its public behavior instead.
    for (const ip of ['192.0.2.1', '0.0.0.0', '255.255.255.255', '10.20.30.40']) {
      for (const suffix of ['', ':3000', '.:8443']) {
        const host = `${label.toUpperCase()}.${ip}.nip.io${suffix}`;
        expect(resolveCountryHostCompatibilityAlias(host)?.label).toBe(label);
        for (const key of ['MK_HOST', 'KS_HOST', 'AL_HOST', 'PILOT_HOST']) {
          const candidate = () => resolveDeploymentOrigin({ ...env, [key]: host });
          if (key === `${label.toUpperCase()}_HOST`) expect(candidate).not.toThrow();
          else expect(candidate).toThrow(key);
        }
      }
    }
  }
);
