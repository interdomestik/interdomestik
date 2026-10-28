import fs from 'node:fs';
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
export const M4_RUNTIME_CONTRACT = freeze(
  JSON.parse(
    fs.readFileSync(new URL('./db-access-m4-runtime-contract.json', import.meta.url), 'utf8')
  )
);
