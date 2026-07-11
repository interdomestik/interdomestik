export function descriptorIsApplicable(descriptor, responses = {}) {
  return (
    !descriptor.requiredWhen ||
    responses[descriptor.requiredWhen.key] === descriptor.requiredWhen.equals
  );
}
export function descriptorIsRequired(descriptor, responses = {}) {
  return (
    descriptorIsApplicable(descriptor, responses) &&
    (descriptor.required === true || Boolean(descriptor.requiredWhen))
  );
}
