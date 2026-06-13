import type { LawPack } from './law-pack-schema';
import {
  UnsupportedLawPackCountryError,
  loadLawPack as loadDefaultLawPack,
} from './law-pack-registry';
import type { RecoveryLawResolution } from './recovery-law';
import { recoveryJurisdictionFromLawPack, resolveRecoveryLaw } from './recovery-law';

export type LawPackResolver = (countryCode: string | null | undefined) => Promise<LawPack>;

export async function resolveRecoveryLawFromLawPack(args: {
  incidentCountryCode?: string | null;
  loadLawPack?: LawPackResolver;
}): Promise<RecoveryLawResolution> {
  try {
    const loadLawPack = args.loadLawPack ?? loadDefaultLawPack;
    const lawPack = await loadLawPack(args.incidentCountryCode);

    return resolveRecoveryLaw({
      incidentCountryCode: args.incidentCountryCode,
      jurisdictions: [recoveryJurisdictionFromLawPack(lawPack)],
    });
  } catch (error) {
    if (error instanceof UnsupportedLawPackCountryError) {
      return resolveRecoveryLaw({
        incidentCountryCode: args.incidentCountryCode,
        jurisdictions: [],
      });
    }

    throw error;
  }
}
