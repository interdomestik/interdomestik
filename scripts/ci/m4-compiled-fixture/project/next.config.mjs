import { ActionMapPlugin } from './action-map-plugin.mjs';
export default {
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  webpack(config, { isServer, nextRuntime }) {
    if (isServer && nextRuntime !== 'edge')
      config.plugins.push(new ActionMapPlugin(import.meta.dirname));
    return config;
  },
};
