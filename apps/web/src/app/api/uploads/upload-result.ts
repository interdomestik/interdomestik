type UploadOk = {
  ok: true;
  status: 200;
  body: {
    upload: {
      id: string;
      path: string;
      token: string;
      signedUrl: string;
      bucket: string;
      expiresIn: number;
      mimeType: string;
      storageContentType: string;
      intentToken?: string;
    };
    classification: string;
    maxFileSize: number;
    allowedMimeTypes: readonly string[];
  };
};

export type UploadErr = {
  ok: false;
  status: 400 | 403 | 404 | 413 | 415 | 500;
  error:
    | 'evidence_unsupported'
    | 'evidence_empty'
    | 'evidence_too_large'
    | 'Invalid file name'
    | 'Forbidden'
    | 'Claim not found'
    | 'File too large'
    | 'File type not allowed'
    | 'Failed to create signed upload URL';
};

export type UploadResult = UploadOk | UploadErr;
