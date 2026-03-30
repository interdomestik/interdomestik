const MIME_BY_EXTENSION: Record<string, string> = {
  avi: 'video/x-msvideo',
  bmp: 'image/bmp',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  eml: 'message/rfc822',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  jfif: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  json: 'application/json',
  m4a: 'audio/mp4',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  msg: 'application/vnd.ms-outlook',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odt: 'application/vnd.oasis.opendocument.text',
  pdf: 'application/pdf',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png',
  rtf: 'application/rtf',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  txt: 'text/plain',
  wav: 'audio/wav',
  webm: 'video/webm',
  webp: 'image/webp',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xml: 'application/xml',
  zip: 'application/zip',
};

export const EVIDENCE_FILE_ACCEPT =
  '.pdf,.txt,.rtf,.csv,.json,.xml,.doc,.docx,.odt,.xls,.xlsx,.ods,.ppt,.pptx,.jpg,.jpeg,.jfif,.png,.webp,.gif,.bmp,.tif,.tiff,.heic,.heif,.mp3,.m4a,.wav,.mp4,.mov,.avi,.webm,.eml,.msg,.zip,application/pdf,text/plain,text/csv,application/json,application/xml,application/rtf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.oasis.opendocument.spreadsheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/jpeg,image/png,image/webp,image/gif,image/bmp,image/tiff,image/heic,image/heif,audio/mpeg,audio/mp4,audio/wav,video/mp4,video/quicktime,video/x-msvideo,video/webm,message/rfc822,application/vnd.ms-outlook,application/zip';

const STORAGE_SAFE_MIME_TYPES = new Set([
  'application/pdf',
  'application/zip',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
]);

const ZIP_CONTAINER_EXTENSIONS = new Set(['docx', 'xlsx', 'pptx', 'odt', 'ods', 'zip']);
const TEXT_LIKE_EXTENSIONS = new Set(['txt', 'rtf', 'csv', 'json', 'xml', 'eml']);

export function resolveUploadMimeType(file: File): string {
  if (file.type) {
    return file.type;
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension) {
    return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
  }

  return 'application/octet-stream';
}

export function resolveStorageUploadContentType(file: File): string {
  const mimeType = resolveUploadMimeType(file);
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (STORAGE_SAFE_MIME_TYPES.has(mimeType)) {
    return mimeType;
  }

  if (extension && TEXT_LIKE_EXTENSIONS.has(extension)) {
    return 'text/plain';
  }

  if (extension && ZIP_CONTAINER_EXTENSIONS.has(extension)) {
    return 'text/plain';
  }

  return 'text/plain';
}
