// The local ESLint plugin of the screen-contract checks (WP-05 design §3). It runs only under the
// dedicated config `apps/web/eslint.screen-contract.config.mjs`, never under the main lint.
import consentControlRegistered from './consent-control-registered.mjs';
import exportsResolution from './exports-resolution.mjs';
import labelledControl from './labelled-control.mjs';
import layerOrder from './layer-order.mjs';
import noAdhocFormat from './no-adhoc-format.mjs';
import noDatabaseImport from './no-database-import.mjs';

export default {
  meta: { name: 'screen-contract' },
  rules: {
    'no-database-import': noDatabaseImport,
    'exports-resolution': exportsResolution,
    'layer-order': layerOrder,
    'no-adhoc-format': noAdhocFormat,
    'consent-control-registered': consentControlRegistered,
    'labelled-control': labelledControl,
  },
};
