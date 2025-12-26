export type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

export type TemplateOptions = {
  title: string;
  intro: string;
  details?: string[];
  ctaLabel: string;
  ctaUrl: string;
  footer?: string;
};
