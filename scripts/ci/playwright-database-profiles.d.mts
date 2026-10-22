type Environment = Record<string, string | undefined>;
export function validateApplicationDatabaseProfile(env: Environment): Record<string, string>;
export function resolvePlaywrightDatabaseProfiles(parent: Environment): {
  driver: Record<string, string>;
  application: Record<string, string>;
};
export const configurePlaywrightDatabaseProfiles: typeof resolvePlaywrightDatabaseProfiles;
