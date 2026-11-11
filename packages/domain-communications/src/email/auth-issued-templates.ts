// Only these existing templates carry credentials issued by the identity authority.
const AUTH_ISSUED_TEMPLATE_TYPES = ['password-reset', 'sign-in-otp'] as const;
export type AuthIssuedTemplateType = (typeof AUTH_ISSUED_TEMPLATE_TYPES)[number];

export function isAuthIssuedTemplate(type: unknown): type is AuthIssuedTemplateType {
  return (
    typeof type === 'string' && AUTH_ISSUED_TEMPLATE_TYPES.includes(type as AuthIssuedTemplateType)
  );
}
