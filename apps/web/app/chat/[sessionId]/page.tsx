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
            <p style={styles.eyebrow}>Session View</p>
            <h1 style={styles.title}>Stored rawlog conversation</h1>
            <p style={styles.sessionId}>{sessionId}</p>
          </div>
          <div style={styles.links}>
            <Link href="/sessions" style={styles.secondaryLink}>
              All Sessions
            </Link>
            <Link href="/chat" style={styles.primaryLink}>
              Back To Chat
            </Link>
          </div>
        </header>

        <p style={styles.status}>{status}</p>

        <section style={styles.messages}>
          {messages.map((message) => (
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
          ))}
        </section>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #111827 0%, #1f2937 100%)',
    color: '#f9fafb',
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
    margin: '8px 0',
    fontSize: 'clamp(2rem, 5vw, 3.4rem)',
    lineHeight: 1,
  },
  sessionId: {
    margin: 0,
    color: '#cbd5e1',
    wordBreak: 'break-all',
  },
  links: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
  primaryLink: {
    textDecoration: 'none',
    padding: '12px 18px',
    borderRadius: '999px',
    background: '#fbbf24',
    color: '#111827',
  },
  secondaryLink: {
    textDecoration: 'none',
    padding: '12px 18px',
    borderRadius: '999px',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#f9fafb',
  },
  status: {
    margin: 0,
    color: '#cbd5e1',
  },
  messages: {
    display: 'grid',
    gap: '12px',
  },
  messageCard: {
    borderRadius: '20px',
    padding: '16px 18px',
    border: '1px solid rgba(255,255,255,0.08)',
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
};
