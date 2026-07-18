const forbiddenRuntimeResiduePolicies = Object.freeze([
  Object.freeze({
    label: 'legacy Clerk runtime configuration',
    pattern: /(?:VITE_)?CLERK_[A-Z_]+|@clerk\/|clerkMiddleware|clerk\.accounts\.dev|clerk\.com/i,
  }),
  Object.freeze({
    label: 'legacy authentication bypass',
    pattern: /LOCAL_AUTH_BYPASS|x-test-user|x-test-aal/i,
  }),
]);

export function findForbiddenRuntimeResidues(file, source) {
  return forbiddenRuntimeResiduePolicies
    .filter((policy) => policy.pattern.test(source))
    .map((policy) => ({ file, policy: policy.label }));
}
