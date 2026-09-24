import en from '@/messages/en/claims.json';
import enCommon from '@/messages/en/common.json';
import mk from '@/messages/mk/claims.json';
import mkCommon from '@/messages/mk/common.json';
import sq from '@/messages/sq/claims.json';
import sqCommon from '@/messages/sq/common.json';
import sr from '@/messages/sr/claims.json';
import srCommon from '@/messages/sr/common.json';

export const catalogs = { en, mk, sq, sr } as const;
export const commonCatalogs = { en: enCommon, mk: mkCommon, sq: sqCommon, sr: srCommon } as const;
export type SupportedLocale = keyof typeof catalogs;

function copy(locale: SupportedLocale) {
  const claims = catalogs[locale].claims;
  const upload = claims.detail.evidenceUpload;
  return {
    dialogTitle: claims.claimsPro.actions.uploadEvidence,
    dialogDescription: upload.description,
    documentTypeLabel: upload.typeLabel,
    documentTypePlaceholder: upload.typeLabel,
    fileLabel: upload.file,
    uploadButton: claims.claimsPro.actions.uploadEvidence,
    uploading: upload.pending,
    cancel: commonCatalogs[locale].common.cancel,
    uploadSuccess: upload.success,
    uploadFailed: upload.failed,
    storageUnavailable: upload.storage,
    aiExtractionConsent: upload.aiConsent,
    types: upload.types,
  };
}

export const localizedCopy = { en: copy('en'), mk: copy('mk'), sq: copy('sq'), sr: copy('sr') };
export const exactCopy = {
  en: '040cbb45ecef013b003a9ae592822382e8adefeb88e6b67dea3bc06932b132d5',
  sq: '2518ce5d0aed3fe1e70387a9ca5f7ad7ed6036556d0bc45c20662e7a36f77c7b',
  mk: 'a5f00380bb5d6bc46e9d2e0200de3e9bc95ebf70533f2f0d7ecf2635f6b08e49',
  sr: '0e492c029956dac99611a186dda11e9761dcffa7ad19f2f2ed63581171731af6',
} as const;
