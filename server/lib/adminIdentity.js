// Synthetic admin addresses: Firebase Auth needs an email with `@`, so a VITE_ADMIN_EMAIL
// without one signs in as `{name}-{projectId}@example.com` (see src/context/AuthContext.tsx).
// The project must be the one this server actually serves. Callers pass the verified ID
// token's `aud`, which verifyIdToken() has already checked equals the Admin app's project,
// so catchy-496207 accepts only `-catchy-496207@` and kartacagenai only `-kartacagenai@`.
export function isSyntheticAdminEmail(email, projectId) {
  const pid = typeof projectId === 'string' ? projectId.trim().toLowerCase() : '';
  if (!pid) return false;
  const lower = String(email || '').trim().toLowerCase();
  const suffix = `-${pid}@example.com`;
  if (!lower.endsWith(suffix)) return false;
  const name = lower.slice(0, -suffix.length);
  return name.length > 0 && !name.includes('@');
}
