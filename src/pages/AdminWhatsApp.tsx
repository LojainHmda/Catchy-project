import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Send, MessageCircle, Plus, X } from 'lucide-react';
import {
  db,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from '../firebase';
import { sendWhatsAppText, normalizePhone } from '../lib/whatsapp';
import { cn } from '../lib/utils';

type Direction = 'in' | 'out';
type Message = {
  id: string;
  phone: string | null;
  name: string | null;
  direction: Direction;
  text: string | null;
  status: string;
  brokerId: string | null;
  createdAt: Date | null;
};

type Conversation = {
  phone: string;
  name: string | null;
  messages: Message[];
  last: Message;
};

function toDate(value: unknown): Date | null {
  if (value && typeof value === 'object' && 'toDate' in value) {
    const maybe = value as { toDate?: () => Date };
    if (typeof maybe.toDate === 'function') return maybe.toDate();
  }
  if (value instanceof Date) return value;
  return null;
}

function formatTime(d: Date | null): string {
  if (!d) return '';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const AdminWhatsApp = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const threadEndRef = useRef<HTMLDivElement>(null);

  // Realtime feed of every message (inbound + outbound).
  useEffect(() => {
    const q = query(collection(db, 'whatsapp_messages'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMessages(
          snap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              phone: data.phone ?? null,
              name: data.name ?? null,
              direction: (data.direction as Direction) ?? 'out',
              text: data.text ?? null,
              status: data.status ?? '',
              brokerId: data.brokerId ?? null,
              createdAt: toDate(data.createdAt),
            };
          })
        );
        setLoading(false);
      },
      (err) => {
        console.error('whatsapp_messages listener error:', err);
        setError('Could not load messages. Check Firestore rules are deployed.');
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  const conversations = useMemo<Conversation[]>(() => {
    const byPhone = new Map<string, Message[]>();
    for (const m of messages) {
      if (!m.phone) continue;
      const list = byPhone.get(m.phone) ?? [];
      list.push(m);
      byPhone.set(m.phone, list);
    }
    return Array.from(byPhone.entries())
      .map(([phone, msgs]) => ({
        phone,
        name: [...msgs].reverse().find((m) => m.name)?.name ?? null,
        messages: msgs,
        last: msgs[msgs.length - 1],
      }))
      .sort((a, b) => (b.last.createdAt?.getTime() ?? 0) - (a.last.createdAt?.getTime() ?? 0));
  }, [messages]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.phone === activePhone) ?? null,
    [conversations, activePhone]
  );

  // Default to the first conversation once data arrives.
  useEffect(() => {
    if (!activePhone && conversations.length > 0) setActivePhone(conversations[0].phone);
  }, [conversations, activePhone]);

  // Auto-scroll the thread to the newest message.
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages.length, activePhone]);

  const send = async () => {
    const phone = activePhone;
    const text = draft.trim();
    if (!phone || !text || sending) return;
    setSending(true);
    setError(null);
    try {
      const result = await sendWhatsAppText(phone, text);
      // Log the outbound message so it appears in the thread (realtime listener picks it up).
      await addDoc(collection(db, 'whatsapp_messages'), {
        phone,
        direction: 'out',
        type: 'Text',
        text,
        status: 'queued',
        brokerId: result.id ?? null,
        createdAt: serverTimestamp(),
      });
      setDraft('');
    } catch (err: any) {
      setError(err?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const startConversation = () => {
    const phone = normalizePhone(newPhone);
    if (!phone) return;
    setActivePhone(phone);
    setComposeOpen(false);
    setNewPhone('');
  };

  return (
    <div className="min-w-0">
      <header className="border-b border-gray-200 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">WhatsApp</h1>
            <p className="mt-0.5 text-sm text-gray-500">Send and receive customer messages.</p>
          </div>
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-catchy px-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-catchy-dark"
          >
            <Plus size={16} /> New
          </button>
        </div>
      </header>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 grid h-[calc(100dvh-12rem)] grid-cols-1 gap-0 overflow-hidden rounded-lg border border-gray-200 bg-white md:grid-cols-[18rem_1fr]">
        {/* Conversation list */}
        <aside
          className={cn(
            'min-h-0 overflow-y-auto border-gray-200 md:border-r',
            activePhone ? 'hidden md:block' : 'block'
          )}
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-sm text-gray-500">
              <MessageCircle className="h-6 w-6 text-gray-300" />
              No conversations yet. Tap “New” to message a customer.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {conversations.map((c) => (
                <li key={c.phone}>
                  <button
                    type="button"
                    onClick={() => setActivePhone(c.phone)}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50',
                      activePhone === c.phone && 'bg-green-50/60'
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-catchy/10 text-catchy">
                      <MessageCircle size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-gray-900">
                        {c.name || `+${c.phone}`}
                      </span>
                      <span className="block truncate text-xs text-gray-500">
                        {c.last.direction === 'out' ? 'You: ' : ''}
                        {c.last.text || '—'}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] text-gray-400">{formatTime(c.last.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Thread */}
        <section className={cn('flex min-h-0 flex-col', activePhone ? 'flex' : 'hidden md:flex')}>
          {activePhone ? (
            <>
              <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => setActivePhone(null)}
                  className="text-gray-400 hover:text-gray-700 md:hidden"
                  aria-label="Back"
                >
                  <X size={18} />
                </button>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-gray-900">
                    {activeConversation?.name || `+${activePhone}`}
                  </span>
                  {activeConversation?.name && (
                    <span className="block text-xs text-gray-500">+{activePhone}</span>
                  )}
                </span>
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-gray-50/50 p-4">
                {(activeConversation?.messages ?? []).map((m) => (
                  <div
                    key={m.id}
                    className={cn('flex', m.direction === 'out' ? 'justify-end' : 'justify-start')}
                  >
                    <div
                      className={cn(
                        'max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                        m.direction === 'out'
                          ? 'rounded-br-sm bg-catchy text-white'
                          : 'rounded-bl-sm bg-white text-gray-900'
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                      <p
                        className={cn(
                          'mt-1 text-[10px]',
                          m.direction === 'out' ? 'text-white/70' : 'text-gray-400'
                        )}
                      >
                        {formatTime(m.createdAt)}
                        {m.direction === 'out' && m.status ? ` · ${m.status}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={threadEndRef} />
              </div>

              <div className="flex items-end gap-2 border-t border-gray-200 p-3">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={1}
                  placeholder="Type a message…"
                  className="max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-catchy"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={sending || !draft.trim()}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-catchy text-white shadow-sm transition-colors hover:bg-catchy-dark disabled:opacity-50"
                  aria-label="Send"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={18} />}
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
              Select a conversation
            </div>
          )}
        </section>
      </div>

      {/* New conversation modal */}
      {composeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setComposeOpen(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">New message</h2>
              <button type="button" onClick={() => setComposeOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>
            <label className="mt-4 block text-xs font-medium text-gray-500">Phone number (international, no +)</label>
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && startConversation()}
              placeholder="e.g. 971585164944"
              inputMode="tel"
              className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none focus:border-catchy"
            />
            <button
              type="button"
              onClick={startConversation}
              disabled={!normalizePhone(newPhone)}
              className="mt-4 h-10 w-full rounded-lg bg-catchy text-sm font-medium text-white transition-colors hover:bg-catchy-dark disabled:opacity-50"
            >
              Start conversation
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminWhatsApp;
