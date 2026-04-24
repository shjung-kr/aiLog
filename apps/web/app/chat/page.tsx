'use client';

import type { CSSProperties, FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import { getSessionRawLogs, sendChatMessage } from '../../lib/api-client';
import type { RawLogResponse } from '../../lib/types';

const STORAGE_KEY = 'ailog.active-session-id';

export default function ChatPage() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<RawLogResponse[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState('Ready');
  const [isSending, setIsSending] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current || typeof window === 'undefined') {
      return;
    }

    initializedRef.current = true;
    const storedSessionId = window.localStorage.getItem(STORAGE_KEY);
    if (!storedSessionId) {
      return;
    }

    setStatus('Loading previous conversation...');
    setSessionId(storedSessionId);
    void getSessionRawLogs(storedSessionId)
      .then((response) => {
        setMessages(response.messages);
        setStatus('Previous conversation restored');
      })
      .catch(() => {
        window.localStorage.removeItem(STORAGE_KEY);
        setSessionId(null);
        setMessages([]);
        setStatus('Previous session could not be restored');
      });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) {
      return;
    }

    setIsSending(true);
    setStatus('Generating reply...');

    try {
      const response = await sendChatMessage({
        session_id: sessionId,
        title: 'Web chat session',
        content: trimmed,
      });
      setSessionId(response.session_id);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, response.session_id);
      }
      setMessages((prev) => [...prev, response.user_message, response.assistant_message]);
      setInput('');
      setStatus('Conversation saved');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save conversation');
    } finally {
      setIsSending(false);
    }
  }

  function handleReset() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setSessionId(null);
    setMessages([]);
    setInput('');
    setStatus('Started a new local chat state');
  }

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <header style={styles.header}>
          <div>
            <p style={styles.eyebrow}>aiLog Chat</p>
            <h1 style={styles.title}>Messages are stored as RawLog the moment you send them.</h1>
          </div>
          <div style={styles.headerMeta}>
            <span style={styles.badge}>{sessionId ? `session ${sessionId.slice(0, 8)}` : 'new session'}</span>
            <button onClick={handleReset} style={styles.secondaryButton} type="button">
              New Session
            </button>
          </div>
        </header>

        <section style={styles.notice}>
          <strong>Current mode:</strong> user messages are sent to the backend, OpenAI generates the assistant reply, and both sides are stored through the FastAPI RawLog API.
        </section>

        <section style={styles.messages}>
          {messages.length === 0 ? (
            <div style={styles.emptyState}>
              <p style={styles.emptyTitle}>No stored messages yet.</p>
              <p style={styles.emptyCopy}>Send a message and the page will create a session if needed, call OpenAI for the reply, and store both messages in order.</p>
            </div>
          ) : (
            messages.map((message) => (
              <article
                key={message.rawlog_id}
                style={{
                  ...styles.messageCard,
                  ...(message.speaker_type === 'user' ? styles.userCard : styles.assistantCard),
                }}
              >
                <div style={styles.messageMeta}>
                  <span>{message.speaker_type}</span>
                  <span>#{message.sequence_no}</span>
                </div>
                <p style={styles.messageText}>{message.content}</p>
              </article>
            ))
          )}
        </section>

        <form onSubmit={handleSubmit} style={styles.form}>
          <textarea
            onChange={(event) => setInput(event.target.value)}
            placeholder="Type a message to start or continue the conversation"
            style={styles.textarea}
            rows={5}
            value={input}
          />
          <div style={styles.formFooter}>
            <span style={styles.status}>{status}</span>
            <button disabled={isSending || !input.trim()} style={styles.primaryButton} type="submit">
              {isSending ? 'Saving...' : 'Send'}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background:
      'radial-gradient(circle at top, rgba(244, 191, 77, 0.3), transparent 30%), linear-gradient(135deg, #0f172a 0%, #111827 45%, #1f2937 100%)',
    color: '#e5e7eb',
    padding: '32px 20px',
    fontFamily: 'Georgia, "Times New Roman", serif',
  },
  shell: {
    maxWidth: '920px',
    margin: '0 auto',
    display: 'grid',
    gap: '18px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '16px',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  eyebrow: {
    margin: 0,
    textTransform: 'uppercase',
    letterSpacing: '0.18em',
    fontSize: '12px',
    color: '#fbbf24',
  },
  title: {
    margin: '8px 0 0',
    fontSize: 'clamp(2rem, 5vw, 3.8rem)',
    lineHeight: 1,
    maxWidth: '12ch',
  },
  headerMeta: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  badge: {
    padding: '10px 14px',
    borderRadius: '999px',
    border: '1px solid rgba(251, 191, 36, 0.35)',
    background: 'rgba(15, 23, 42, 0.65)',
    fontSize: '13px',
  },
  secondaryButton: {
    border: '1px solid rgba(229, 231, 235, 0.2)',
    background: 'transparent',
    color: '#f9fafb',
    borderRadius: '999px',
    padding: '10px 16px',
    cursor: 'pointer',
  },
  notice: {
    padding: '14px 16px',
    borderRadius: '18px',
    background: 'rgba(17, 24, 39, 0.7)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    lineHeight: 1.5,
  },
  messages: {
    display: 'grid',
    gap: '12px',
    minHeight: '360px',
    alignContent: 'start',
  },
  emptyState: {
    padding: '28px',
    borderRadius: '24px',
    border: '1px dashed rgba(251, 191, 36, 0.35)',
    background: 'rgba(15, 23, 42, 0.48)',
  },
  emptyTitle: {
    margin: 0,
    fontSize: '24px',
  },
  emptyCopy: {
    margin: '10px 0 0',
    color: '#cbd5e1',
    lineHeight: 1.6,
  },
  messageCard: {
    borderRadius: '20px',
    padding: '16px 18px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.18)',
  },
  userCard: {
    background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(120, 53, 15, 0.35))',
  },
  assistantCard: {
    background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.92), rgba(55, 65, 81, 0.88))',
  },
  messageMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: '#cbd5e1',
    marginBottom: '10px',
  },
  messageText: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    lineHeight: 1.6,
    fontSize: '16px',
  },
  form: {
    display: 'grid',
    gap: '12px',
    padding: '18px',
    borderRadius: '24px',
    background: 'rgba(15, 23, 42, 0.78)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },
  textarea: {
    width: '100%',
    borderRadius: '18px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: '16px',
    background: 'rgba(2, 6, 23, 0.66)',
    color: '#f9fafb',
    resize: 'vertical',
    fontSize: '16px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  formFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  status: {
    color: '#cbd5e1',
    fontSize: '14px',
  },
  primaryButton: {
    border: 0,
    borderRadius: '999px',
    padding: '12px 22px',
    cursor: 'pointer',
    background: '#fbbf24',
    color: '#111827',
    fontWeight: 700,
  },
};
