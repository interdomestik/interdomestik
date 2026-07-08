import { describe, expect, it } from 'vitest';
import packManifest from '../../../public/help-now-packs/content-packs.v1.json';
import {
  HELP_NOW_COUNTRY_PACKS,
  HELP_NOW_CONTENT_LOCALES,
  HELP_NOW_PACK_ASSET,
  canExposeCountryPack,
  getHelpNowContentLocale,
  getSignedOffHelpNowPacks,
  getTripModeDownloadAssets,
} from './content-packs';

describe('MOB-01 content-pack gating', () => {
  it('exposes only the accepted MK country pack', () => {
    const signedPacks = getSignedOffHelpNowPacks();
    const mkPack = HELP_NOW_COUNTRY_PACKS.find(pack => pack.country === 'MK');
    const unsignedPacks = HELP_NOW_COUNTRY_PACKS.filter(pack => pack.country !== 'MK');

    expect(signedPacks).toHaveLength(1);
    expect(signedPacks[0]?.country).toBe('MK');
    expect(mkPack).toBeDefined();
    expect(mkPack?.exposure).toBe('public');
    expect(mkPack?.reviewStatus).toBe('accepted');
    expect(mkPack?.l2SignOff?.packHash).toBe(
      'evidence-center:2026-07-07:gazmend:mk-country-content'
    );
    expect(mkPack ? canExposeCountryPack(mkPack) : false).toBe(true);
    expect(unsignedPacks.every(pack => pack.exposure === 'dark')).toBe(true);
    expect(unsignedPacks.every(pack => !canExposeCountryPack(pack))).toBe(true);
  });

  it('keeps unsupported route locales on English copy while preserving Germany as a trip country', () => {
    expect(HELP_NOW_CONTENT_LOCALES).not.toContain('de');
    expect(getHelpNowContentLocale('de')).toBe('en');
    expect(HELP_NOW_COUNTRY_PACKS.some(pack => pack.country === 'DE')).toBe(true);
  });

  it('keeps hr routable with the English fallback until localized copy is signed off', () => {
    expect(getHelpNowContentLocale('hr')).toBe('en');
  });

  it('only exposes public pack assets for Trip Mode offline download', () => {
    expect(getTripModeDownloadAssets()).toEqual([HELP_NOW_PACK_ASSET]);
    expect(getTripModeDownloadAssets().some(asset => asset.startsWith('/api/'))).toBe(false);
    expect(getTripModeDownloadAssets().some(asset => asset.includes('/member'))).toBe(false);
  });

  it('keeps the served pack manifest aligned with the TS gate metadata', () => {
    expect(packManifest.countries).toEqual(HELP_NOW_COUNTRY_PACKS);
  });
});
