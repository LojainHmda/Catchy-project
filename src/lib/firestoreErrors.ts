import { toast } from 'sonner';

export function firestoreErrorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';
}

export function firestoreErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? 'Unknown error');
}

/** Surfaces permission-denied with deploy-rules guidance (same as Admin Products). */
export function toastFirestoreWriteError(
  error: unknown,
  title: string,
  t: (key: string) => string = (key) => key
) {
  const code = firestoreErrorCode(error);
  const msg = firestoreErrorMessage(error);

  if (code === 'permission-denied') {
    const pid = String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '').trim();
    const rulesUrl = pid
      ? `https://console.firebase.google.com/project/${pid}/firestore/rules`
      : 'https://console.firebase.google.com/';
    toast.error(t('admin.firestoreError.permissionDeniedTitle'), {
      description: t('admin.firestoreError.permissionDeniedDesc').replace('{title}', title),
      duration: 25_000,
      action: {
        label: t('admin.firestoreError.openRules'),
        onClick: () => window.open(rulesUrl, '_blank', 'noopener,noreferrer'),
      },
    });
    return;
  }

  if (msg.includes('Quota') || msg.includes('RESOURCE_EXHAUSTED') || code === 'resource-exhausted') {
    toast.error(title, { description: t('admin.firestoreError.quotaExceeded') });
    return;
  }

  toast.error(title, { description: msg || code || t('admin.firestoreError.seeConsole') });
}
