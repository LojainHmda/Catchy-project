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
export function toastFirestoreWriteError(error: unknown, title: string) {
  const code = firestoreErrorCode(error);
  const msg = firestoreErrorMessage(error);

  if (code === 'permission-denied') {
    const pid = String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '').trim();
    const rulesUrl = pid
      ? `https://console.firebase.google.com/project/${pid}/firestore/rules`
      : 'https://console.firebase.google.com/';
    toast.error('Firestore: permission denied', {
      description:
        `${title} — cloud rules may not include coordinate_looks yet. Run "npm run firebase:deploy:firestore" or publish firestore.rules in the Firebase console, then sign out and in again.`,
      duration: 25_000,
      action: {
        label: 'Open Rules',
        onClick: () => window.open(rulesUrl, '_blank', 'noopener,noreferrer'),
      },
    });
    return;
  }

  if (msg.includes('Quota') || msg.includes('RESOURCE_EXHAUSTED') || code === 'resource-exhausted') {
    toast.error(title, { description: 'Firestore quota exceeded. Try again later.' });
    return;
  }

  toast.error(title, { description: msg || code || 'See the browser console for details.' });
}
