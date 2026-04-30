'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { getSessions } from '../../lib/api-client';
import type { SessionResponse } from '../../lib/types';

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionResponse[]>([]);
  const [status, setStatus] = useState('Loading sessions...');

  useEffect(() => {
    void getSessions()
      .then((items) => {
        setSessions(items);
        setStatus(items.length === 0 ? 'No stored sessions yet' : `${items.length} sessions loaded`);
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Failed to load sessions');
      });
  }, []);

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <header style={styles.header}>
          <div>
            <p style={styles.eyebrow}>Saved Sessions</p>
            <h1 style={styles.title}>Browse stored conversations.</h1>
          </div>
          <Link href="/chat" style={styles.primaryLink}>
            Open Chat
          </Link>
        </header>

        <p style={styles.status}>{status}</p>

        <section style={styles.list}>
          {sessions.map((session) => (
            <Link href={`/chat/${session.session_id}`} key={session.session_id} style={styles.card}>
              <div style={styles.cardMeta}>
                <span>{session.status}</span>
                <span>{new Date(session.last_activity_at).toLocaleString()}</span>
              </div>
              <h2 style={styles.cardTitle}>{session.title || 'Untitled session'}</h2>
              <p style={styles.cardCopy}>{session.session_id}</p>
            </Link>
          ))}
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
    alignItems: 'flex-end',
    gap: '16px',
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
  primaryLink: {
    textDecoration: 'none',
    padding: '10px 14px',
    borderRadius: '8px',
    background: '#111827',
    color: '#ffffff',
  },
  status: {
    margin: 0,
    color: '#475569',
  },
  list: {
    display: 'grid',
    gap: '14px',
  },
  card: {
    display: 'grid',
    gap: '10px',
    padding: '16px',
    borderRadius: '8px',
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    color: 'inherit',
    textDecoration: 'none',
  },
  cardMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    fontSize: '12px',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: '#64748b',
    flexWrap: 'wrap',
  },
  cardTitle: {
    margin: 0,
    fontSize: '20px',
  },
  cardCopy: {
    margin: 0,
    color: '#64748b',
    fontSize: '12px',
    wordBreak: 'break-all',
  },
};
