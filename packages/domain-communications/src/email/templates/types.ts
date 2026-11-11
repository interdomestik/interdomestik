import type { AuthIssuedTemplateType } from '../auth-issued-templates';

export type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
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
