'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { getSessionRawLogs } from '../../../lib/api-client';
import type { RawLogResponse } from '../../../lib/types';

export default function SessionChatPage() {
  const params = useParams<{ sessionId: string }>();
  const [messages, setMessages] = useState<RawLogResponse[]>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const [status, setStatus] = useState('Loading session...');

  useEffect(() => {
    if (!params.sessionId) {
      return;
    }

    let cancelled = false;
    setSessionId(params.sessionId);
    void getSessionRawLogs(params.sessionId)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setMessages(response.messages);
        setStatus(`${response.messages.length} messages loaded`);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setStatus(error instanceof Error ? error.message : 'Failed to load session');
      });

    return () => {
      cancelled = true;
    };
  }, [params]);

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <header style={styles.header}>
          <div>
            <p style={styles.eyebrow}>RawLog Session</p>
            <h1 style={styles.title}>Stored conversation logs.</h1>
            <p style={styles.sessionId}>{sessionId}</p>
          </div>
          <div style={styles.links}>
            <Link href="/sessions" style={styles.secondaryLink}>
              Sessions
            </Link>
            <Link href="/episodes" style={styles.secondaryLink}>
              Episodes
            </Link>
            <Link href="/chat" style={styles.primaryLink}>
              Chat
            </Link>
          </div>
        </header>

        <p style={styles.status}>{status}</p>

        <section style={styles.messages}>
          {messages.length === 0 ? (
            <article style={styles.emptyCard}>
              <p style={styles.emptyText}>No RawLogs stored for this session.</p>
            </article>
          ) : (
            messages.map((message) => (
              <article key={message.rawlog_id} style={styles.messageCard}>
                <div style={styles.messageMeta}>
                  <span style={message.speaker_type === 'user' ? styles.userBadge : styles.assistantBadge}>
                    {message.speaker_type}
                  </span>
                  <span>#{message.sequence_no}</span>
                  <span>{new Date(message.occurred_at).toLocaleString()}</span>
                </div>
                <p style={styles.messageText}>{message.content}</p>
                <div style={styles.rawlogMeta}>
                  <span>{message.message_type || 'message'}</span>
                  <span>{message.rawlog_id}</span>
                </div>
              </article>
            ))
          )}
        </section>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f7f7f5',
    color: '#1f2937',
    padding: '32px 20px',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  shell: {
    maxWidth: '960px',
    margin: '0 auto',
    display: 'grid',
    gap: '18px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '16px',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  eyebrow: {
    margin: 0,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontSize: '12px',
    color: '#475569',
  },
  title: {
    margin: '8px 0 0',
    fontSize: '32px',
    lineHeight: 1.1,
  },
  sessionId: {
    margin: '10px 0 0',
    color: '#64748b',
    fontSize: '13px',
    wordBreak: 'break-all',
  },
  links: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  primaryLink: {
    textDecoration: 'none',
    padding: '10px 14px',
    borderRadius: '8px',
    background: '#111827',
    color: '#ffffff',
  },
  secondaryLink: {
    textDecoration: 'none',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    color: '#111827',
  },
  status: {
    margin: 0,
    color: '#475569',
  },
  messages: {
    display: 'grid',
    gap: '12px',
  },
  emptyCard: {
    padding: '16px',
    borderRadius: '8px',
    background: '#ffffff',
    border: '1px solid #e5e7eb',
  },
  emptyText: {
    margin: 0,
    color: '#64748b',
  },
  messageCard: {
    display: 'grid',
    gap: '10px',
    borderRadius: '8px',
    padding: '16px',
    background: '#ffffff',
    border: '1px solid #e5e7eb',
  },
  messageMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
    fontSize: '12px',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#64748b',
  },
  userBadge: {
    borderRadius: '999px',
    padding: '4px 8px',
    background: '#dcfce7',
    color: '#166534',
    fontSize: '12px',
    letterSpacing: 0,
    textTransform: 'none',
  },
  assistantBadge: {
    borderRadius: '999px',
    padding: '4px 8px',
    background: '#e0f2fe',
    color: '#075985',
    fontSize: '12px',
    letterSpacing: 0,
    textTransform: 'none',
  },
  messageText: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    lineHeight: 1.6,
    fontSize: '16px',
    color: '#334155',
  },
  rawlogMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
    color: '#64748b',
    fontSize: '12px',
    wordBreak: 'break-all',
  },
};
