import type { AuthIssuedTemplateType } from '../auth-issued-templates';

export type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
  // Unknown at persisted boundaries; renderEmailDelivery validates the versioned source.
  source?: unknown;
};

export type TemplateOptions = {
  templateType?: AuthIssuedTemplateType;
  title: string;
  intro: string;
  details?: string[];
  ctaLabel: string;
  ctaUrl: string;
  footer?: string;
};
