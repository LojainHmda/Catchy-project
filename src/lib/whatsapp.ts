/**
 * Client-side helpers for sending WhatsApp messages.
 *
 * The browser NEVER holds the API token — it POSTs to our own backend route
 * (`/api/whatsapp/send`), which adds the `Authorization: Basic <token>` header
 * server-side. In dev that route is the Vite middleware in vite.config.ts; in
 * production it must be a real backend (Cloud Functions / Cloud Run).
 */

export type SendResult = {
  result: boolean;
  message: string;
  /** Broker message id (present on success), used to correlate webhook status later. */
  id?: string;
};

/** Strip everything except digits — broker wants `fullPhoneNumber` with no `+`/`00`/spaces. */
export function normalizePhone(raw: string): string {
  let digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  return digits;
}

export async function sendWhatsAppText(fullPhoneNumber: string, message: string): Promise<SendResult> {
  const phone = normalizePhone(fullPhoneNumber);
  const res = await fetch('/api/whatsapp/send', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({fullPhoneNumber: phone, message}),
  });

  let payload: SendResult;
  try {
    payload = (await res.json()) as SendResult;
  } catch {
    throw new Error(`Send failed (HTTP ${res.status})`);
  }
  if (!res.ok || !payload.result) {
    throw new Error(payload?.message || `Send failed (HTTP ${res.status})`);
  }
  return payload;
}
