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
    background: 'linear-gradient(135deg, #f5f3ef 0%, #e7dfd4 100%)',
    color: '#1f2937',
    padding: '32px 20px',
    fontFamily: 'Georgia, "Times New Roman", serif',
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
    letterSpacing: '0.18em',
    fontSize: '12px',
    color: '#92400e',
  },
  title: {
    margin: '8px 0 0',
    fontSize: 'clamp(2rem, 5vw, 3.4rem)',
    lineHeight: 1,
  },
  primaryLink: {
    textDecoration: 'none',
    padding: '12px 18px',
    borderRadius: '999px',
    background: '#111827',
    color: '#f9fafb',
  },
  status: {
    margin: 0,
    color: '#4b5563',
  },
  list: {
    display: 'grid',
    gap: '14px',
  },
  card: {
    display: 'grid',
    gap: '10px',
    padding: '18px',
    borderRadius: '20px',
    background: 'rgba(255,255,255,0.8)',
    border: '1px solid rgba(17,24,39,0.08)',
    boxShadow: '0 18px 40px rgba(17, 24, 39, 0.08)',
    color: 'inherit',
    textDecoration: 'none',
  },
  cardMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    fontSize: '12px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#6b7280',
    flexWrap: 'wrap',
  },
  cardTitle: {
    margin: 0,
    fontSize: '22px',
  },
  cardCopy: {
    margin: 0,
    color: '#4b5563',
    wordBreak: 'break-all',
  },
};
