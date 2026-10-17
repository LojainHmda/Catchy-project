// Register session open/close — running sales totals are incremented inside the
// sale transaction itself (posSale.js); this file only manages the session lifecycle.

export async function openPosSession(db, { cashierUid, cashierEmail, cashierName, openingCashFloat }) {
  const openingFloat = Math.max(0, Number(openingCashFloat) || 0);

  // Resume an already-open session for this cashier instead of creating a duplicate
  // (covers a page refresh or the cashier re-hitting "open register").
  const existing = await db
    .collection('register_sessions')
    .where('cashierUid', '==', cashierUid)
    .where('status', '==', 'open')
    .limit(1)
    .get();

  if (!existing.empty) {
    const doc = existing.docs[0];
    return { ok: true, id: doc.id, resumed: true, ...doc.data() };
  }

  const ref = db.collection('register_sessions').doc();
  const session = {
    cashierUid,
    cashierEmail: cashierEmail || null,
    cashierName: cashierName || null,
    status: 'open',
    openedAt: new Date(),
    closedAt: null,
    openingCashFloat: openingFloat,
    expectedCashAtClose: null,
    countedCashAtClose: null,
    cashVarianceAtClose: null,
    salesCount: 0,
    cashTotal: 0,
    cardTotal: 0,
    discountTotal: 0,
    grossTotal: 0,
    notes: null,
  };
  await ref.set(session);
  return { ok: true, id: ref.id, resumed: false, ...session };
}

export async function closePosSession(db, { sessionId, cashierUid, role, countedCashAtClose, notes }) {
  if (!sessionId) return { ok: false, code: 'NO_SESSION', message: 'No session id provided.' };
  const counted = Math.max(0, Number(countedCashAtClose) || 0);

  try {
    const result = await db.runTransaction(async (tx) => {
      const ref = db.collection('register_sessions').doc(sessionId);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('SESSION_NOT_FOUND');
      const session = snap.data();
      if (session.status !== 'open') throw new Error('SESSION_ALREADY_CLOSED');
      if (session.cashierUid !== cashierUid && role !== 'admin') throw new Error('SESSION_FORBIDDEN');

      const expected =
        Math.round(((Number(session.openingCashFloat) || 0) + (Number(session.cashTotal) || 0)) * 100) / 100;
      const variance = Math.round((counted - expected) * 100) / 100;

      const patch = {
        status: 'closed',
        closedAt: new Date(),
        expectedCashAtClose: expected,
        countedCashAtClose: counted,
        cashVarianceAtClose: variance,
        notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
      };
      tx.update(ref, patch);
      return { id: sessionId, ...session, ...patch };
    });
    return { ok: true, session: result };
  } catch (error) {
    const code = error?.message || 'UNKNOWN';
    if (code === 'SESSION_NOT_FOUND') return { ok: false, code, message: 'Register session not found.' };
    if (code === 'SESSION_ALREADY_CLOSED') {
      return { ok: false, code, message: 'This register session is already closed.' };
    }
    if (code === 'SESSION_FORBIDDEN') {
      return { ok: false, code, message: 'You do not have permission to close this session.' };
    }
    console.error('[pos] close session failed:', error);
    return { ok: false, code: 'UNKNOWN', message: 'Could not close the register. Please try again.' };
  }
}
